// Trainers: every "find the bug" case is consistent (the marked line exists, the fix is valid
// C#, the live checks catch the ones they claim to), "predict the output" questions always have
// exactly one right answer that comes from really running the code, and the Unity facts are sane.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { ACHIEVEMENTS, type Facts } from '../src/code/learn/achievements';
import { BUGS, fixedCode, prepareBug } from '../src/code/learn/bugs';
import { PREDICT, makeQuestion, rng } from '../src/code/learn/predict';
import { CHEAT_SHEET, LIFECYCLE, WHICH } from '../src/code/learn/unityFacts';
import { parseCSharp, runCSharp, syntaxProblems } from '../src/code/run/runner';
import { lintCSharp } from '../src/code/workshop/lint';

setLocale('en', false);

describe('find the bug', () => {
  it('has many Unity cases with unique ids', () => {
    expect(BUGS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(BUGS.map((b) => b.id)).size).toBe(BUGS.length);
  });

  for (const b of BUGS)
    it(`${b.id}: one marked line, the fix parses, the checks agree`, async () => {
      const { lines, answer } = prepareBug(b);
      expect(answer, 'marker').toBeGreaterThanOrEqual(0);
      expect(b.code.split('//!').length - 1).toBe(1);
      expect(lines.join('\n')).not.toContain('//!');
      const fixed = fixedCode(b);
      expect(syntaxProblems(await parseCSharp(fixed), fixed), 'fixed code grammar').toEqual([]);
      if (b.lint) {
        const before = lintCSharp(lines.join('\n'), b.file).filter((f) => f.line === answer || (b.id === 'file-name' && f.line === answer));
        expect(before.length, 'live check finds the bug').toBeGreaterThan(0);
        const after = lintCSharp(fixed, b.file).filter((f) => f.line === answer && f.severity !== 'info');
        expect(after, 'no finding after the fix').toEqual([]);
      }
    });
});

describe('what will it print?', () => {
  const run = async (code: string) => {
    const r = await runCSharp(code);
    return r.status === 'done' ? r.output : null;
  };

  it('every template makes valid questions for many random seeds', async () => {
    for (const t of PREDICT)
      for (let seed = 1; seed <= 25; seed++) {
        const q = await makeQuestion(t, seed * 7919, run);
        expect(q, `${t.id} seed ${seed}`).not.toBeNull();
        expect(q!.options.length, `${t.id} options`).toBeGreaterThanOrEqual(3);
        expect(new Set(q!.options.map((o) => o.text)).size, `${t.id} unique`).toBe(q!.options.length);
        expect(q!.answer).toBeGreaterThanOrEqual(0);
        expect(q!.options[q!.answer].why).toBeUndefined();
        for (const [i, o] of q!.options.entries()) if (i !== q!.answer) expect(o.why, `${t.id} wrong option explained`).toBeDefined();
      }
  });

  it('the right answer is what the program really prints', async () => {
    const q = await makeQuestion(PREDICT.find((t) => t.id === 'int-div')!, 42, run);
    const r = await runCSharp(`using System;\n${q!.code}`);
    expect(q!.options[q!.answer].text).toBe(r.output.join('\n'));
    const a = rng(1)();
    expect(rng(1)()).toBe(a);
  });
});

describe('Unity facts and achievements', () => {
  it('event order, quiz answers and cheat sheet are consistent', () => {
    expect(LIFECYCLE.map((s) => s.name)).toEqual(['Awake', 'OnEnable', 'Start', 'FixedUpdate', 'Update', 'LateUpdate', 'OnDisable', 'OnDestroy']);
    for (const w of WHICH) expect(LIFECYCLE.some((s) => s.name === w.answer)).toBe(true);
    expect(CHEAT_SHEET.reduce((n, s) => n + s.rows.length, 0)).toBeGreaterThanOrEqual(25);
  });

  it('achievements unlock from progress', () => {
    const zero: Facts = { lessonsDone: 0, courseDone: 0, advancedDone: 0, projectDone: 0, projectTotal: 5, unityLevels: 0, unityTotal: 14, streak: 0, xp: 0, reviewCards: 0, notes: 0, bugs: 0, bugsTotal: 26, predictRight: 0, predictBestStreak: 0, lifecycleBest: 0, cheatOpened: false, goalDays: 0, shooterDone: 0, shooterTotal: 25 };
    expect(ACHIEVEMENTS.filter((a) => a.done(zero))).toEqual([]);
    const all: Facts = { ...zero, lessonsDone: 8, courseDone: 16, advancedDone: 9, projectDone: 5, unityLevels: 14, streak: 7, xp: 900, reviewCards: 30, notes: 6, bugs: 26, predictRight: 20, predictBestStreak: 6, lifecycleBest: 8, cheatOpened: true, goalDays: 3, shooterDone: 25 };
    expect(ACHIEVEMENTS.every((a) => a.done(all))).toBe(true);
    for (const a of ACHIEVEMENTS) expect(a.progress(zero)).toBeLessThan(1);
  });
});
