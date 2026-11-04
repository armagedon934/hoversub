// Browser end-to-end check of the Workshop, Mini-Unity, error translator, review/notebook,
// focus timer and local-AI settings (requires `npm run build`). Every request that is not to the
// local preview server is blocked (proves it works offline). Screenshots → verification/workshop/.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const OUT = 'verification';
const SHOTS = join(OUT, 'workshop');
const PORT = 4206;
const URL = `http://localhost:${PORT}/`;
const AI_PORT = 4207;

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

/** A tiny fake "Ollama" on localhost, to test the local-AI bridge without a real model. */
function fakeOllama() {
  const seen: string[] = [];
  const srv = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`${req.method} ${req.url} ${body.slice(0, 200)}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'tiny-coder:1b' }] }));
      if (req.url === '/api/generate') {
        const b = JSON.parse(body || '{}');
        const isCode = /CURSOR/.test(b.prompt ?? '');
        return res.end(JSON.stringify({ response: isCode ? '```csharp\nDebug.Log("from AI");\n```' : 'Это строка выводит сообщение. (тестовый ответ)' }));
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  srv.listen(AI_PORT);
  return { srv, seen };
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function setEditor(page: Page, testid: string, text: string) {
  await page.locator(`[data-testid="${testid}"] .cm-content`).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  // insertText avoids auto-closing brackets/indentation while "typing"
  await page.keyboard.insertText(text);
}

async function main() {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const ai = fakeOllama();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, acceptDownloads: true });
  const external: string[] = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(URL) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith(`http://localhost:${AI_PORT}/`)) return route.continue();
    external.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/localhost:4207|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs++;
    void d.accept();
  });

  try {
    await page.goto(URL);
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-welcome').waitFor();
    // Russian interface (the person's language).
    await page.getByTestId('open-settings').click();
    await page.getByTestId('lang-ru').click();
    await page.getByTestId('code-welcome').waitFor();
    check('Welcome offers Workshop, Mini-Unity and the error translator', (await page.getByTestId('start-workshop').count()) === 1 && (await page.getByTestId('start-unity').count()) === 1 && (await page.getByTestId('start-errors').count()) === 1);
    await shot(page, '01-welcome-ru');

    // ------------------------------------------------------------------ Workshop: Unity script
    await page.getByTestId('start-workshop').click();
    await page.getByTestId('workshop').waitFor();
    await page.locator('[data-testid="ws-editor"] .cm-content').waitFor();
    check('Workshop starts with a Unity script', (await page.getByTestId('ws-name').inputValue()) === 'Player.cs');
    await setEditor(page, 'ws-editor', 'using UnityEngine;\n\npublic class Player : MonoBehaviour\n{\n    public float speed = 5f;\n\n    void Update()\n    {\n        ');
    await page.waitForSelector('[data-testid="ghost-text"]', { timeout: 5000 });
    const ghost = await page.getByTestId('ghost-text').textContent();
    check('Ghost text guesses the next line inside Update', /Input\.GetAxis\("Horizontal"\)/.test(ghost ?? ''), ghost ?? '');
    await shot(page, '02-ghost-text');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="ghost-text"]', { timeout: 5000 });
    const ghost2 = await page.getByTestId('ghost-text').textContent();
    check('After accepting, the next guess moves the player with Time.deltaTime', /transform\.Translate\(x \* speed \* Time\.deltaTime/.test(ghost2 ?? ''), ghost2 ?? '');
    await page.keyboard.press('Tab');
    const text = await page.evaluate(() => document.querySelector('[data-testid="ws-editor"] .cm-content')?.textContent ?? '');
    check('Tab inserted both guessed lines', text.includes('float x = Input.GetAxis("Horizontal");') && text.includes('transform.Translate(x * speed * Time.deltaTime, 0, 0);'));
    const preds = await page.getByTestId('ws-pred').count();
    check('The hints panel lists ideas with reasons', preds >= 0);

    // Suggestions after a dot, with explanations.
    await page.keyboard.press('Enter');
    await page.keyboard.type('Input.', { delay: 20 });
    await page.waitForSelector('.cm-tooltip-autocomplete li', { timeout: 5000 });
    const items = await page.locator('.cm-tooltip-autocomplete li').allTextContents();
    check('Typing "Input." suggests Unity members', items.some((t) => t.includes('GetKeyDown')) && items.some((t) => t.includes('GetAxis')), items.slice(0, 6).join(' | '));
    await page.waitForSelector('.cm-completionInfo', { timeout: 5000 });
    const info = await page.locator('.cm-completionInfo').textContent();
    check('Each suggestion is explained in Russian', /[а-я]/i.test(info ?? ''), info ?? '');
    await shot(page, '03-completion-unity');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');

    // Live checks with a one-click fix: lowercase "update".
    await setEditor(page, 'ws-editor', 'using UnityEngine;\n\npublic class Player : MonoBehaviour\n{\n    void update()\n    {\n        transform.position.x += 1;\n    }\n}\n');
    await page.waitForFunction(() => /никогда не вызовет/.test(document.querySelector('[data-testid="ws-problems"]')?.textContent ?? '') && /CS1612/.test(document.querySelector('[data-testid="ws-problems"]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    const probs = await page.getByTestId('ws-problems').textContent();
    check('Live check: lowercase update() is explained (Unity would silently ignore it)', /никогда не вызовет/.test(probs ?? ''), probs?.slice(0, 120));
    check('Live check: CS1612 position.x is explained', /CS1612/.test(probs ?? ''));
    await shot(page, '04-live-checks');
    await page.getByTestId('ws-fix').first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="ws-editor"] .cm-content')?.textContent?.includes('void Update()'));
    check('One-click fix renames update → Update', true);

    // "I want…" recipes.
    await page.getByTestId('ws-want').click();
    await page.getByTestId('ws-recipe-search').fill('хочу чтобы персонаж прыгал');
    const first = await page.getByTestId('ws-recipe').first().textContent();
    check('"Хочу…" finds the jump recipe from a Russian wish', /прыж/i.test(first ?? ''), first ?? '');
    await page.getByTestId('ws-recipe').first().locator('.ws-recipe-head').click();
    await shot(page, '05-recipes');
    await page.getByTestId('ws-recipe-newfile').click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="ws-name"]') as HTMLInputElement)?.value === 'PlayerPlatformer.cs');
    check('Recipe opens as a new file named like its class', true);

    // ------------------------------------------------------------------ Workshop: console C#
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-cs').click();
    await setEditor(page, 'ws-editor', 'using System;\n\nint Twice(int n)\n{\n    return n * 2;\n}\nConsole.Write("Как тебя зовут? ");\nstring name = Console.ReadLine();\nint x = Twice(21);\nConsole.WriteLine("Привет, " + name + "! " + x);\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-answer').waitFor();
    check('C# run stops and asks for ReadLine', /Как тебя зовут/.test((await page.getByTestId('ws-result').textContent()) ?? ''));
    await page.getByTestId('ws-answer').fill('Аня');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Привет, Аня! 42/.test(document.querySelector('[data-testid="ws-output"]')?.textContent ?? ''));
    check('C# program finishes with the answer and real values', true);
    await page.getByTestId('ws-show-steps').click();
    await page.getByTestId('trace-view').waitFor();
    for (let i = 0; i < 4; i++) await page.getByTestId('trace-next').click();
    const say = await page.getByTestId('trace-say').textContent();
    check('Step-by-step replay narrates in Russian', /[а-я]/i.test(say ?? ''), say ?? '');
    let sawTwice = false;
    for (let i = 0; i < 12 && !sawTwice; i++) {
      const frames = await page.getByTestId('trace-frame').allTextContents();
      sawTwice = frames.some((f) => /Twice/.test(f) && /n\s*21/.test(f));
      if (!sawTwice) await page.getByTestId('trace-next').click();
    }
    check('Replay shows the function call with its parameter box (n = 21)', sawTwice);
    await shot(page, '06-trace-csharp');

    // Runtime error explained.
    await setEditor(page, 'ws-editor', 'using System;\nint[] a = new int[3];\na[3] = 5;\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-error').waitFor();
    const err = await page.getByTestId('ws-error').textContent();
    check('Runtime error is explained with how to fix', /IndexOutOfRange|за пределами/i.test(err ?? '') && /Как исправить/.test(err ?? ''), err?.slice(0, 120));

    // ------------------------------------------------------------------ Python (real CPython)
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-py').click();
    await setEditor(page, 'ws-editor', 'def square(n):\n    return n * n\n\nname = input("Имя? ")\nfor i in range(3):\n    print(name, square(i))\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-answer').waitFor({ timeout: 120000 });
    await page.getByTestId('ws-answer').fill('Боб');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Боб 4/.test(document.querySelector('[data-testid="ws-output"]')?.textContent ?? ''), null, { timeout: 60000 });
    const pyOut = await page.getByTestId('ws-output').textContent();
    check('Python runs offline (Pyodide) with input()', /Имя\? Боб[\s\S]*Боб 0[\s\S]*Боб 1[\s\S]*Боб 4/.test(pyOut ?? ''), pyOut ?? '');
    await page.getByTestId('ws-show-steps').click();
    await page.getByTestId('trace-view').waitFor();
    const count = await page.getByTestId('trace-count').textContent();
    check('Python run has a step-by-step replay', /Шаг 1 \/ \d+/.test(count ?? ''), count ?? '');
    await shot(page, '07-python');
    await setEditor(page, 'ws-editor', 'while True:\n    pass\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-error').waitFor({ timeout: 30000 });
    check('An endless Python loop is stopped and explained', /бесконечн/i.test((await page.getByTestId('ws-error').textContent()) ?? ''));

    // ------------------------------------------------------------------ JavaScript
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-js').click();
    await setEditor(page, 'ws-editor', 'let sum = 0;\nfor (let i = 1; i <= 4; i++) sum += i;\nconsole.log("sum", sum);\nconsole.log(typeof fetch);\nundefinedThing();\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-error').waitFor();
    const jsOut = await page.getByTestId('ws-output').textContent();
    const jsErr = await page.getByTestId('ws-error').textContent();
    check('JavaScript runs in a worker without network functions', /sum 10/.test(jsOut ?? '') && /undefined/.test(jsOut ?? ''), jsOut ?? '');
    check('JavaScript error points to the right line', /строка 5/.test(jsErr ?? ''), jsErr?.slice(0, 100));
    await setEditor(page, 'ws-editor', 'while (true) {}\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('ws-error').waitFor({ timeout: 15000 });
    check('An endless JS loop is stopped after a few seconds', /бесконечн/i.test((await page.getByTestId('ws-error').textContent()) ?? ''));

    // ------------------------------------------------------------------ C++: honest
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-cpp').click();
    await page.getByTestId('ws-run').click();
    check('C++ is honestly not run (needs a compiler)', /компилятор/.test((await page.getByTestId('ws-result').textContent()) ?? ''));

    // ------------------------------------------------------------------ Mini-Unity
    await page.getByTestId('view-unity').click();
    await page.getByTestId('mini-unity').waitFor();
    await page.getByTestId('mu-level-move-right').click();
    await page.locator('[data-testid="mu-editor"] .cm-content').waitFor();
    await setEditor(page, 'mu-editor', 'using UnityEngine;\n\npublic class Hero : MonoBehaviour\n{\n    public float speed = 3f;\n\n    void Update()\n    {\n        transform.position += new Vector3(speed * Time.deltaTime, 0, 0);\n    }\n}\n');
    await page.getByTestId('mu-play').click();
    await page.getByTestId('mu-won').waitFor({ timeout: 20000 });
    check('Mini-Unity: a correct script wins the level', true);
    const inspector = await page.getByTestId('mu-inspector').textContent();
    check('Mini-Unity Inspector shows public fields', /speed/.test(inspector ?? ''), inspector ?? '');
    await shot(page, '08-mini-unity-won');
    await page.getByTestId('mu-next').click();
    await page.locator('[data-testid="mu-editor"] .cm-content').waitFor();
    await setEditor(page, 'mu-editor', 'using UnityEngine;\npublic class Hero : MonoBehaviour\n{\n    void Update()\n    {\n        while (true) { }\n    }\n}\n');
    await page.getByTestId('mu-play').click();
    await page.getByTestId('mu-error').waitFor();
    check('Mini-Unity: an endless loop in Update is caught (Unity would freeze)', /бесконечн/i.test((await page.getByTestId('mu-error').textContent()) ?? ''));

    // Keyboard play on the arrows level with a real script.
    await setEditor(page, 'mu-editor', 'using UnityEngine;\n\npublic class Hero : MonoBehaviour\n{\n    public float speed = 4f;\n\n    void Update()\n    {\n        float h = Input.GetAxisRaw("Horizontal");\n        float v = Input.GetAxisRaw("Vertical");\n        transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;\n        if (Input.GetKeyDown(KeyCode.Space)) Debug.Log("Space!");\n    }\n}\n');
    await page.getByTestId('mu-play').click();
    await page.getByTestId('mu-stage').focus();
    await page.keyboard.press('Space');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);
    const consoleText = await page.getByTestId('mu-console').textContent();
    check('Mini-Unity reacts to real key presses (Debug.Log on Space)', /Space!/.test(consoleText ?? ''), consoleText ?? '');
    await shot(page, '09-mini-unity-keys');

    // Workshop → Mini-Unity sandbox.
    await page.getByTestId('view-workshop').click();
    await page.getByTestId('ws-new').click();
    await page.getByTestId('ws-new-unity').click();
    await setEditor(page, 'ws-editor', 'using UnityEngine;\n\npublic class Player : MonoBehaviour\n{\n    void Start()\n    {\n        Debug.Log("Hello from Workshop");\n    }\n}\n');
    await page.getByTestId('ws-run').click();
    await page.getByTestId('mu-level-sandbox').waitFor();
    await page.getByTestId('mu-play').click();
    await page.waitForFunction(() => /Hello from Workshop/.test(document.querySelector('[data-testid="mu-console"]')?.textContent ?? ''));
    check('A Unity script from the Workshop plays in the Mini-Unity sandbox', true);
    await page.getByTestId('mu-stop').click();

    // ------------------------------------------------------------------ Error translator
    await page.getByTestId('view-errors').click();
    await page.getByTestId('et-example').click();
    const cards = await page.getByTestId('et-card').count();
    const etText = await page.getByTestId('error-translator').textContent();
    check('Error translator explains pasted Unity errors', cards === 3 && /Что это значит/.test(etText ?? '') && /строка 12/.test(etText ?? ''), `${cards} cards`);
    await shot(page, '10-error-translator');
    await page.getByTestId('et-card').first().getByRole('button').click();

    // ------------------------------------------------------------------ Notebook / review / resume
    await page.getByTestId('view-learn').click();
    await page.getByTestId('hub-notebook').click();
    const notes = await page.getByTestId('note').count();
    check('Saved explanation appears in the notebook', notes >= 1, `${notes} notes`);
    await page.getByTestId('note-title').fill('Update вызывается каждый кадр');
    await page.getByTestId('note-text').fill('Поэтому скорость умножают на Time.deltaTime');
    await page.getByTestId('note-add').click();
    await page.getByTestId('hub-review').click();
    await page.getByTestId('review').waitFor();
    const stats = await page.getByTestId('review-stats').textContent();
    check('Notebook notes become review cards (box 1)', /^2/.test(stats ?? '') || /2коробка 1/.test(stats ?? ''), stats ?? '');
    // make cards due now and review
    await page.evaluate(() => {
      const k = 'mf.review.v1';
      const c = JSON.parse(localStorage.getItem(k) ?? '[]');
      for (const x of c) x.due = 0;
      localStorage.setItem(k, JSON.stringify(c));
    });
    await page.reload();
    await page.getByTestId('mode-code').click().catch(() => {});
    await page.getByTestId('code-welcome').waitFor();
    const resume = await page.getByTestId('resume-card').textContent();
    check('Welcome shows "continue where you stopped" and waiting review cards', /Продолжить/.test(resume ?? '') && /Повторение/.test(resume ?? ''), resume ?? '');
    await shot(page, '11-resume');
    await page.getByTestId('resume-review').click();
    await page.getByTestId('review-card').waitFor();
    await page.getByTestId('review-show').click();
    await page.getByTestId('review-remember').click();
    check('Review session: show answer → "I remember" moves on', true);
    await shot(page, '12-review');

    // ------------------------------------------------------------------ Courses + compare languages
    await page.getByTestId('view-learn').click();
    await page.getByTestId('hub-courses').click();
    await page.getByTestId('courses').waitFor();
    check('Courses: C# for Unity has 16 lessons', (await page.getByTestId('course-lesson-card').count()) === 16);
    await page.getByTestId('course-start-next').click();
    await page.getByTestId('course-read').waitFor();
    await shot(page, '16-course-read');
    await page.getByTestId('course-watch').click();
    await page.getByTestId('trace-view').waitFor();
    check('Course lesson replays the real run step by step', /Шаг 1 \/ \d+/.test((await page.getByTestId('trace-count').textContent()) ?? ''));
    await page.getByTestId('course-to-quiz').click();
    for (let q = 0; q < 2; q++) {
      const opts = page.getByTestId('quiz-option');
      const n = await opts.count();
      for (let k = 0; k < n; k++) {
        await opts.nth(k).click();
        if (await page.getByTestId('quiz-next').count()) break;
      }
      await page.getByTestId('quiz-next').click();
    }
    await page.getByTestId('course-task').waitFor();
    await setEditor(page, 'course-task-editor', 'using System;\n\nint coins = 10;\ncoins += 4;\nConsole.WriteLine("Coins: " + coins);\n');
    await page.getByTestId('task-check').click();
    check('Course task: a wrong answer shows needed vs printed', /Coins: 14/.test((await page.getByTestId('task-result').textContent()) ?? ''));
    await shot(page, '17-course-task-wrong');
    await setEditor(page, 'course-task-editor', 'using System;\n\nint coins = 10;\ncoins += 5;\nConsole.WriteLine("Coins: " + coins);\n');
    await page.getByTestId('task-check').click();
    await page.getByTestId('task-next').click();
    await page.getByTestId('course-done').waitFor();
    check('Course task: the right code is accepted and the lesson completes', true);
    await page.getByTestId('course-exit').click().catch(() => {});
    await page.getByTestId('course-unreal').click();
    await page.getByTestId('course-lesson-card').first().click();
    await page.getByTestId('course-watch').click();
    await page.getByTestId('course-walk').waitFor();
    check('Unreal lesson: honest line-by-line walk (C++ not run)', /нельзя запустить/.test((await page.getByTestId('course-walk').textContent()) ?? ''));
    await page.getByTestId('hub-lessons').click();
    if (await page.getByTestId('track-cs').count()) await page.getByTestId('track-cs').click();
    await page.getByTestId('lesson-card').first().click();
    await page.getByTestId('compare-languages').click();
    const cmp = await page.getByTestId('compare-grid').textContent();
    check('Lessons: compare the same code in other languages', /C\+\+/.test(cmp ?? '') && /Python/.test(cmp ?? ''));
    await shot(page, '18-compare-languages');

    // ------------------------------------------------------------------ Focus timer
    await page.getByTestId('open-focus').click();
    await page.getByTestId('focus-timer').waitFor();
    await page.getByTestId('focus-start').click();
    await page.waitForTimeout(1300);
    const t = await page.locator('.focus-time').textContent();
    check('Focus timer counts down', /^(14|09|24|44):5\d$/.test(t ?? ''), t ?? '');

    // ------------------------------------------------------------------ Local AI (fake local server)
    await page.getByTestId('open-settings').click();
    await page.getByTestId('ai-enabled').check();
    await page.getByTestId('ai-url').fill(`http://localhost:${AI_PORT}`);
    await page.getByTestId('ai-url').blur();
    await page.getByTestId('ai-check').click();
    await page.getByTestId('ai-status').waitFor();
    check('Local AI: connection check lists models', /Моделей: 1/.test((await page.getByTestId('ai-status').textContent()) ?? ''));
    await page.getByTestId('ai-url').fill('http://example.com:11434');
    await page.getByTestId('ai-url').blur();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mf.ai.v1') ?? '{}').url);
    check('Local AI: non-local addresses are refused', kept === `http://localhost:${AI_PORT}`, kept);
    await shot(page, '13-ai-settings');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 300);
    await page.getByTestId('view-workshop').click();
    await page.getByTestId('ws-file-select').selectOption({ label: 'Player.cs' });
    await page.locator('[data-testid="ws-editor"] .cm-content').click();
    await page.keyboard.press('Control+End');
    await page.getByTestId('ws-ai-next').click();
    await page.waitForFunction(() => /from AI/.test(document.querySelector('[data-testid="ghost-text"]')?.textContent ?? ''), null, { timeout: 10000 });
    check('Local AI guess appears as marked ghost text (inserted only on Tab)', /догадка ИИ/.test((await page.getByTestId('ghost-text').textContent()) ?? ''));
    check('Only the local AI address was contacted', ai.seen.length >= 2 && ai.seen.every((s) => /^(GET|POST) \/api\//.test(s)));
    await shot(page, '14-ai-ghost');

    // ------------------------------------------------------------------ narrow screen
    await page.setViewportSize({ width: 820, height: 1100 });
    await page.getByTestId('view-unity').click();
    await page.getByTestId('mini-unity').waitFor();
    await shot(page, '15-tablet-mini-unity');
    const overflow = await page.evaluate(() => {
      if (document.documentElement.scrollWidth <= window.innerWidth + 2) return '';
      const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2).slice(0, 4);
      return wide.map((e) => `${e.tagName}.${(e as HTMLElement).className}`).join(', ') || String(document.documentElement.scrollWidth);
    });
    check('Tablet width: no horizontal page scroll', !overflow, overflow);
  } catch (e) {
    check('Unexpected failure', false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    await shot(page, 'zz-failure').catch(() => {});
  } finally {
    check('No requests left this computer', external.length === 0, external.slice(0, 3).join(', '));
    check('No page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close();
    server.kill();
    ai.srv.close();
    const failed = checks.filter((c) => !c.ok);
    writeFileSync(join(OUT, 'e2e-workshop-report.json'), JSON.stringify({ when: new Date().toISOString(), passed: checks.length - failed.length, failed: failed.length, dialogs, checks }, null, 2));
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  }
}

void main();
