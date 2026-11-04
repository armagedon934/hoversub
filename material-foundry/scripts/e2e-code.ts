// Browser end-to-end check of the UNDERSTAND CODE module (requires `npm run build`).
// Blocks every request that is not to the local preview server, drives the real UI, saves
// screenshots to verification/code/ and a report to verification/e2e-code-report.json.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { SAMPLES } from '../tests/codeSamples';

const OUT = 'verification';
const SHOTS = join(OUT, 'code');
const PORT = 4205;
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

const code = (page: Page, expr: string): Promise<any> => page.evaluate(`(() => { const s = window.__mf.code.getState(); return ${expr}; })()`);
const idle = (page: Page) => page.waitForFunction(() => !(window as any).__mf?.code?.getState().busy, null, { timeout: 60000 });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function clickText(page: Page, line: number, text: string) {
  const span = page.locator(`.cv-line[data-line="${line}"] span[data-s]`, { hasText: text }).first();
  await span.click();
  await page.waitForFunction((t) => (window as any).__mf.code.getState().selection?.element.text.includes(t), text);
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const external: string[] = [];
  // Block everything that is not this local app: proves no internet is needed.
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
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('dialog', (d) => {
    errors.push(`unexpected dialog: ${d.message()}`);
    void d.dismiss();
  });

  try {
    await page.goto(URL);
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-welcome').waitFor();
    check('UNDERSTAND CODE opens from the top bar', true);
    await shot(page, '01-welcome');

    // ---- the example project
    await page.getByTestId('code-welcome').getByTestId('open-example').click();
    await page.getByTestId('overview').waitFor();
    await idle(page);
    const kind = await page.locator('.ov-kind').textContent();
    check('Project explainer describes the example', /Python project with a web page/.test(kind ?? ''), kind ?? '');
    check('Project explainer finds the starting point', (await page.locator('.ov-card', { hasText: 'Where it starts' }).textContent())?.includes('main.py') ?? false);
    await shot(page, '02-project-explained');

    await page.locator('[data-path="shop/cart.py"]').click();
    await page.getByTestId('code-view').waitFor();
    check('File opens with language and analysis depth shown', /Python[\s\S]*Full structure/.test((await page.getByTestId('file-bar').textContent()) ?? ''));
    await clickText(page, 2, 'TAX_RATE');
    const title = await page.getByTestId('explain-title').textContent();
    check('Clicking a variable explains it', /TAX_RATE/.test(title ?? '') && /constant/i.test(title ?? ''), title ?? '');
    check('Explanation shows a confidence level', (await page.getByTestId('confidence').first().textContent())?.length! > 0);
    await shot(page, '03-explain-variable');

    // five levels, switch instantly and remembered for the session
    const sums: string[] = [];
    for (const l of [1, 2, 3, 4, 5]) {
      await page.getByTestId(`level-${l}`).click();
      sums.push((await page.getByTestId('explain-summary').textContent()) ?? '');
    }
    check('Five explanation levels give different wording', new Set(sums).size === 5, sums.map((s) => s.slice(0, 40)).join(' | '));
    check('Level 5 shows an exercise', (await page.locator('[data-block=exercise]').count()) === 1);
    await shot(page, '04-level-5-teach-me');
    await page.reload();
    await page.getByTestId('code-module').waitFor();
    await idle(page);
    check('Chosen level is remembered after reload', (await code(page, 's.prefs.level')) === 5);
    check('Workspace and project are restored after reload', (await code(page, 's.files.length')) === 10);
    await page.locator('[data-path="shop/cart.py"]').click();
    await page.getByTestId('code-view').waitFor();
    await page.getByTestId('level-2').click();

    // function, bracket, operator, keyword
    await clickText(page, 24, 'total');
    check('Function definition explained with inputs', /total/.test((await page.getByTestId('explain-title').textContent()) ?? '') && (await code(page, 's.selection.element.func.params.length')) === 2);
    await page.getByTestId('diagram-connections').click();
    check('Function diagram shows who uses it', (await page.getByTestId('diagram').textContent())?.includes('Used by') ?? false);
    await page.getByTestId('diagram-flow').click();
    check('Step-by-step flowchart is drawn', (await page.locator('.fl-box').count()) > 2);
    await shot(page, '05-function-flowchart');
    await clickText(page, 29, '*');
    check('Operator explained', (await code(page, 's.selection.element.kind')) === 'operator');
    await clickText(page, 27, 'if');
    check('Keyword explained', (await code(page, 's.selection.element.kind')) === 'keyword');
    await clickText(page, 24, '(');
    check('Bracket explained with its partner highlighted', (await code(page, 's.selection.element.kind')) === 'bracket' && (await page.locator('.hl-partner').count()) > 0);
    await page.getByTestId('diagram-auto').click();

    // I don't understand / example
    await clickText(page, 20, 'for');
    await page.getByTestId('dont-understand').click();
    const s1 = await page.locator('[data-block=simpler]').textContent();
    await page.getByTestId('dont-understand').click();
    const s2 = await page.locator('[data-block=simpler]').textContent();
    check('"I don\'t understand" gives a new, simpler explanation each time', !!s1 && !!s2 && s1 !== s2);
    await page.getByTestId('show-example').click();
    check('"Show me with an example" shows an example', (await page.getByTestId('example').count()) === 1);
    await shot(page, '06-dont-understand-example');
    await page.getByTestId('show-example').click();

    // definition / references
    await clickText(page, 29, 'TAX_RATE');
    await page.getByTestId('show-uses').click();
    check('"Show every use" highlights the uses', (await page.locator('.hl-ref, .hl-def').count()) >= 2);
    await page.getByTestId('go-definition').click();
    await page.waitForFunction(() => (window as any).__mf.code.getState().selection?.element.range.line === 2);
    check('"Where is it made?" jumps to the definition', true);
    await page.locator('[data-path="main.py"]').click();
    await page.getByTestId('code-view').waitFor();
    await clickText(page, 11, 'format_price');
    await page.getByTestId('go-definition').click();
    await page.waitForFunction(() => (window as any).__mf.code.getState().openPath === 'shop/prices.py');
    check('Go to definition across files (main.py → shop/prices.py)', true);

    // keyboard navigation
    await page.getByTestId('code-view').focus();
    const before = await code(page, 's.selection?.element.range.start');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((b) => (window as any).__mf.code.getState().selection?.element.range.start !== b, before);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('3');
    check('Keyboard: arrows move between words, number keys choose the level', (await code(page, 's.prefs.level')) === 3);
    await page.keyboard.press('2');

    // ---- what if I change this? (apply only after confirmation)
    await page.locator('[data-path="shop/cart.py"]').click();
    await page.getByTestId('code-view').waitFor();
    await clickText(page, 2, '0.2');
    await page.getByTestId('what-if').click();
    await page.getByTestId('goal-change-value').click();
    await page.getByTestId('whatif-input').fill('0.25');
    await page.getByTestId('whatif-preview').click();
    await page.getByTestId('whatif-checks').waitFor();
    check('Preview shows a before/after diff', (await page.getByTestId('whatif-diff').textContent())?.includes('0.25') ?? false);
    check('Preview lists risks', (await page.getByTestId('whatif-risks').locator('li').count()) > 0);
    check('Nothing changed before confirming', (await page.evaluate(() => (window as any).__mf.workspace.changedFiles().length)) === 0);
    check('Apply needs explicit confirmation', await page.getByTestId('whatif-apply').isDisabled());
    await shot(page, '07-what-if-preview');
    await page.getByTestId('whatif-ack').check();
    await page.getByTestId('whatif-apply').click();
    await page.getByTestId('whatif-dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => (window as any).__mf.code.getState().openText.includes('TAX_RATE = 0.25'));
    check('Change applied to the workspace copy', true);
    check('Restore point was created first', (await page.evaluate(() => (window as any).__mf.workspace.restorePoints.length)) >= 1);
    check('Original text kept separately', (await page.evaluate(() => (window as any).__mf.workspace.files.get('shop/cart.py').original.includes('TAX_RATE = 0.2\n'))) === true);
    check('Changed lines are marked in the code', (await page.locator('.cv-line.changed').count()) === 1);

    // a breaking change is detected
    await clickText(page, 2, 'TAX_RATE');
    await page.getByTestId('what-if').click();
    await page.getByTestId('goal-edit-line').click();
    await page.getByTestId('whatif-input').fill('TAX_RATE = (0.25');
    await page.getByTestId('whatif-preview').click();
    await page.getByTestId('whatif-checks').waitFor();
    check('Preview warns when a change breaks the code', /new problem/.test((await page.getByTestId('whatif-checks').textContent()) ?? ''));
    await page.keyboard.press('Escape');
    await page.getByTestId('whatif-dialog').waitFor({ state: 'detached' });

    // rename across files
    await page.locator('[data-path="shop/prices.py"]').click();
    await page.getByTestId('code-view').waitFor();
    await clickText(page, 5, 'format_price');
    await page.getByTestId('what-if').click();
    await page.getByTestId('goal-rename').click();
    await page.getByTestId('whatif-input').fill('show_price');
    await page.getByTestId('whatif-preview').click();
    await page.getByTestId('whatif-checks').waitFor();
    check('Rename preview covers both connected files', (await page.getByTestId('whatif-diff').count()) === 2);
    await page.getByTestId('whatif-ack').check();
    await page.getByTestId('whatif-apply').click();
    await page.getByTestId('whatif-dialog').waitFor({ state: 'detached' });

    // ---- changes, undo/redo, restore
    await page.getByTestId('view-changes').click();
    await page.getByTestId('changes-view').waitFor();
    check('Changes view lists changed files', (await page.getByTestId('changed-file').count()) === 3);
    await shot(page, '08-changes');
    await page.getByTestId('ws-undo').click();
    await page.waitForFunction(() => (window as any).__mf.workspace.changedFiles().length === 1);
    check('Undo reverts the last change (rename)', true);
    await page.getByTestId('ws-redo').click();
    await page.waitForFunction(() => (window as any).__mf.workspace.changedFiles().length === 3);
    check('Redo re-applies it', true);
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => (window as any).__mf.workspace.changedFiles().length === 1);
    check('Ctrl+Z undoes in the code module', true);
    await page.getByTestId('restore-point').last().click();
    await page.getByTestId('restore-confirm').click();
    await page.waitForFunction(() => (window as any).__mf.workspace.changedFiles().length === 0);
    check('Restore point brings back the earlier state', true);
    const dl = page.waitForEvent('download');
    await page.getByTestId('download-all').click();
    const d = await dl;
    check('Workspace can be downloaded as a ZIP', d.suggestedFilename().endsWith('.zip'), d.suggestedFilename());

    // ---- map, glossary, settings
    await page.getByTestId('view-map').click();
    check('Project map draws the files', (await page.locator('.pm-node').count()) >= 6);
    await shot(page, '09-project-map');
    await page.getByTestId('view-glossary').click();
    await page.getByTestId('glossary').getByRole('textbox').fill('loop');
    await page.locator('.gl-list li button', { hasText: /^Loop/ }).first().click();
    check('Glossary explains ideas offline', (await page.locator('.gl-body h2').textContent())?.toLowerCase().includes('loop') ?? false);
    const fontBefore: number = await code(page, 's.prefs.fontSize');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('theme-light').click();
    await page.getByTestId('font-bigger').click();
    await page.getByTestId('font-bigger').click();
    await page.getByTestId('view-code').click();
    check('Light theme and bigger text', (await page.locator('.cm.theme-light').count()) === 1 && (await code(page, 's.prefs.fontSize')) === fontBefore + 2);
    await shot(page, '10-light-theme');
    check('Settings panel closes when clicking elsewhere', (await page.locator('.popover').count()) === 0);
    await page.getByTestId('open-settings').click();
    await page.getByTestId('font-smaller').click();
    await page.getByTestId('font-smaller').click();
    await page.getByTestId('theme-dark').click();
    await page.keyboard.press('Escape');

    // ---- opening many languages, unknown and binary files, without running anything
    await page.getByTestId('close-project').click();
    await page.getByTestId('close-project-confirm').click();
    const files = Object.entries(SAMPLES).map(([name, s]) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(s.text) }));
    files.push({ name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]) });
    files.push({ name: 'boom.js', mimeType: 'text/javascript', buffer: Buffer.from('window.__opened_and_ran = true; alert("ran");\n') });
    await page.waitForFunction(() => (window as any).__mf.code.getState().files.length === 0);
    await page.getByTestId('file-input').setInputFiles(files);
    await page.getByTestId('overview').waitFor({ timeout: 90000 });
    await idle(page);
    const workers = await page.evaluate(() => (window as any).__mf.codeClient.workerCount);
    check('Grammars are spread over several analysis workers', workers >= 2, `${workers} workers for 18 grammars`);
    let crashed = false;
    page.once('crash', () => (crashed = true));
    await page.waitForTimeout(15000);
    check('Page stays alive 15 s after loading every grammar (Chromium compiler memory)', !crashed);
    const langs: Record<string, string> = await code(page, 'Object.fromEntries(s.files.map((f) => [f.path, f.languageId]))');
    const wrong = Object.entries(SAMPLES).filter(([n, s]) => langs[n] !== s.lang);
    check(`All ${Object.keys(SAMPLES).length} sample files detected correctly`, wrong.length === 0, wrong.map(([n]) => `${n}=${langs[n]}`).join(', '));
    check('Binary file listed but not opened as text', (await code(page, "s.files.find((f) => f.path === 'picture.png').skipped")) !== undefined);
    await page.locator('[data-path="boom.js"]').click();
    await page.getByTestId('code-view').waitFor();
    check('Opening a script never runs it', (await page.evaluate(() => (window as any).__opened_and_ran)) === undefined);
    for (const name of ['q.sql', 's.ps1', 'notes.xyz', 'k.kt', 'g.lua']) {
      await page.locator(`[data-path="${name}"]`).click();
      await page.getByTestId('code-view').waitFor();
      await page.locator('.cv-line[data-line="0"] span[data-s]').first().click();
      await page.getByTestId('explain-title').waitFor();
    }
    check('SQL, PowerShell, Kotlin, Lua and unknown files are explainable', true);
    await shot(page, '11-many-languages');

    // search inside the code
    await page.getByTestId('search-in-code').check();
    await page.getByTestId('search').fill('add(');
    check('Search inside the code finds matches', (await page.getByTestId('search-results').locator('button').count()) >= 5);
    await page.getByTestId('search').fill('');

    // a large file stays responsive
    const big = Array.from({ length: 6000 }, (_, i) => `def f${i}(a, b):\n    total = a + b * ${i}\n    return total\n`).join('\n');
    const t0 = Date.now();
    await page.getByTestId('file-input').setInputFiles([{ name: 'big.py', mimeType: 'text/plain', buffer: Buffer.from(big) }]);
    await page.getByTestId('code-view').waitFor();
    await idle(page);
    const openMs = Date.now() - t0;
    const rendered = await page.locator('.cv-line').count();
    check('Large file (24,000 lines) opens and only visible lines are drawn', rendered < 300, `${openMs} ms, ${rendered} line elements`);
    await page.getByTestId('code-view').evaluate((el) => (el.scrollTop = 22 * 18000));
    await page.waitForTimeout(200);
    await page.locator('.cv-line span.tk-function').first().click();
    await page.getByTestId('explain-title').waitFor();
    check('Clicking deep inside a large file works', /^f\d+/.test((await code(page, 's.selection?.element.symbolName')) ?? ''));

    // offline: cut the network completely and keep working
    await ctx.setOffline(true);
    await page.getByTestId('view-overview').click();
    await page.getByTestId('view-code').click();
    await page.locator('.cv-line span.tk-keyword').first().click();
    await page.getByTestId('level-4').click();
    check('Keeps working with the network switched off', (await page.getByTestId('explain-summary').textContent())!.length > 10);
    await ctx.setOffline(false);
    await page.getByTestId('level-2').click();

    // ---- step-by-step player for real code (flow of a function, nothing is run)
    await page.getByTestId('close-project').click();
    await page.getByTestId('close-project-confirm').click();
    await page.getByTestId('code-welcome').getByTestId('open-example').click();
    await page.getByTestId('overview').waitFor();
    await idle(page);
    check('Guide offers the next step (open the main file)', (await page.getByTestId('guide').textContent())?.includes('main.py') ?? false);
    await page.getByTestId('guide-action').click();
    await page.getByTestId('code-view').waitFor();
    check('Guide then says: click a word', /click any word/i.test((await page.getByTestId('guide').textContent()) ?? ''));
    await clickText(page, 8, 'print_receipt');
    await page.getByTestId('diagram-flow').click();
    await page.getByTestId('flow-next').click();
    await page.getByTestId('flow-next').click();
    check('"Show me step by step" walks through the lines of a function', (await page.getByTestId('flow-player').textContent())?.includes('2 /') ?? false);
    await shot(page, '12-step-by-step-player');

    // ---- Learn: a full lesson (C#), animation, games, XP
    await page.getByTestId('view-learn').click();
    await page.getByTestId('track-cs').click();
    await page.getByTestId('start-next-lesson').click();
    await page.getByTestId('lesson-watch').click();
    await page.getByTestId('anim-next').click();
    check('Animation shows the changed box (health = 70)', (await page.getByTestId('anim-frames').textContent())?.includes('70') ?? false);
    await page.getByTestId('anim-next').click();
    check('Animation shows the program output on the "screen"', (await page.getByTestId('anim-output').textContent())?.trim() === '70');
    await shot(page, '13-learn-animation');
    await page.getByTestId('anim-done').click();
    await page.getByTestId('game-option').nth(2).click();
    check('Game 1: right answer is confirmed', /Correct/.test((await page.getByTestId('game-feedback').textContent()) ?? ''));
    await page.getByTestId('game-next').click();
    await page.getByTestId('game-option').nth(0).click();
    check('Game 2: a wrong answer is answered kindly, with another try', /Try again/.test((await page.getByTestId('game-feedback').textContent()) ?? ''));
    await page.getByTestId('game-option').nth(1).click();
    await page.getByTestId('game-next').click();
    await page.locator('.ln-tok', { hasText: /^\+$/ }).first().click();
    check('Game 3: "find the mistake" by tapping the wrong symbol', /Correct/.test((await page.getByTestId('game-feedback').textContent()) ?? ''));
    await page.getByTestId('game-next').click();
    for (const want of ['int health = 100;', 'health = health - 30;', 'Console.WriteLine(health);']) {
      const texts = await page.getByTestId('order-pool').allTextContents();
      await page.getByTestId('order-pool').nth(texts.indexOf(want)).click();
    }
    check('Game 4: "put the lines in order"', /Correct/.test((await page.getByTestId('game-feedback').textContent()) ?? ''));
    await page.getByTestId('game-next').click();
    await page.getByTestId('lesson-done').waitFor();
    const xp = await page.evaluate(() => JSON.parse(localStorage.getItem('mf.learn.v1') ?? '{}'));
    check('Lesson completed: stars and XP are saved', xp.xp >= 50 && xp.done?.['cs:variables']?.stars === 2, `xp ${xp.xp}, stars ${xp.done?.['cs:variables']?.stars}`);
    await shot(page, '14-lesson-done');
    await page.getByTestId('lesson-next').click();
    check('"Next lesson" opens the next lesson', (await page.getByTestId('lesson').textContent())?.includes('Conditions') ?? false);
    await page.getByTestId('lesson-exit').click();

    // ---- Russian interface
    await page.getByTestId('open-settings').click();
    await page.getByTestId('lang-ru').click();
    await page.getByTestId('learn').waitFor();
    check('Russian interface: tabs and lessons switch to Russian', ((await page.getByTestId('view-learn').textContent()) ?? '').includes('Учиться') && ((await page.getByTestId('lesson-path').textContent()) ?? '').includes('Переменные'));
    await page.getByTestId('view-code').click();
    await page.getByTestId('code-view').waitFor();
    await clickText(page, 8, 'print_receipt');
    check('Russian explanations', /[а-яё]/i.test((await page.getByTestId('explain-summary').textContent()) ?? ''), (await page.getByTestId('explain-summary').textContent()) ?? '');
    await shot(page, '15-russian-explanation');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('lang-en').click();

    check('No request ever left this computer', external.length === 0, external.join(', '));
    check('No errors in the page', errors.length === 0, errors.slice(0, 5).join(' | '));
    await page.getByTestId('mode-materials').click();
    await page.getByTestId('open-export').waitFor();
    check('Switching back to Materials shows the material studio', true);
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? e.message.split('\n')[0] : String(e));
    console.log('state at failure:', await page.evaluate(() => { const s = (window as any).__mf?.code?.getState(); return s && JSON.stringify({ busy: s.busy, files: s.files.length, view: s.view, open: s.openPath, err: s.error, toasts: s.toasts }); }).catch(() => 'n/a'));
    console.log('errors:', errors.slice(0, 5));
    await shot(page, 'zz-failure').catch(() => {});
  } finally {
    await browser.close();
    server.kill();
  }
  const passed = checks.filter((c) => c.ok).length;
  writeFileSync(join(OUT, 'e2e-code-report.json'), JSON.stringify({ when: new Date().toISOString(), passed, total: checks.length, checks }, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}

void main();
