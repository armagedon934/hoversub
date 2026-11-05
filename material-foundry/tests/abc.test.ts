import { describe, expect, it } from 'vitest';
import { ABC_LEVELS, momentOf, runAbc, type AbcLevel } from '../src/code/learn/abc';
import { setLocale, type Locale } from '../src/code/i18n';

/** Extra runs some goals need (a goal like "with 3 lives Bit is silent" needs another variant). */
const VARIANTS: Record<string, (answer: string) => string[]> = {
  'abc-braces': (a) => [a.replace('raining = true', 'raining = false')],
  'abc-compare': (a) => [a.replace('lives = 3', 'lives = 0')],
  'abc-index': (a) => [a.replace('bag[2]', 'bag[3]')],
};

async function goalsReached(level: AbcLevel, sources: string[]) {
  const reached = new Set<number>();
  for (const src of sources) {
    const run = await runAbc(src, level.scene(src));
    level.goals.forEach((g, i) => g.check(run) && reached.add(i));
  }
  return reached;
}

describe.each<Locale>(['ru', 'en'])('ABC of code (%s)', (locale) => {
  it('has 10 levels ending with the boss', () => {
    expect(ABC_LEVELS).toHaveLength(10);
    expect(ABC_LEVELS.at(-1)!.id).toBe('abc-boss');
  });

  for (const level of ABC_LEVELS) {
    it(`${level.id}: the answer (and its variants) reaches every goal`, async () => {
      setLocale(locale, false);
      const answer = level.answer[locale];
      const reached = await goalsReached(level, [answer, ...(VARIANTS[level.id]?.(answer) ?? [])]);
      expect([...reached].sort()).toEqual(level.goals.map((_, i) => i));
    });

    it(`${level.id}: the starter does not pass and shows a funny moment`, async () => {
      setLocale(locale, false);
      const starter = level.starter[locale];
      const run = await runAbc(starter, level.scene(starter));
      const all = level.goals.every((g) => g.check(run));
      expect(all).toBe(false);
      const m = momentOf(level, run);
      if (level.id !== 'abc-assign') expect(m, `${level.id} starter moment`).not.toBeNull();
    });
  }

  it('the boss shows the moments one after another as the learner fixes it', async () => {
    setLocale(locale, false);
    const boss = ABC_LEVELS.at(-1)!;
    let src = boss.starter[locale];
    const seen: string[] = [];
    const fixes: [RegExp, string][] = [
      [/Walk\(3\)\n/, 'Walk(3);\n'],
      [/robot\.Jump;/, 'robot.Jump();'],
      [/AtFlag\(\) = true/, 'AtFlag() == true'],
      [/Say\((Победа|Victory)!\)/, 'Say("$1!")'],
    ];
    for (const [re, to] of fixes) {
      const run = await runAbc(src, boss.scene(src));
      seen.push(momentOf(boss, run)?.id ?? 'none');
      src = src.replace(re, to);
    }
    expect(seen).toEqual(['semicolon', 'parens', 'equals-in-if', 'quotes']);
    const final = await runAbc(src, boss.scene(src));
    expect(boss.goals.every((g) => g.check(final))).toBe(true);
  });

  it('walking into the pit makes the robot fall', async () => {
    const boss = ABC_LEVELS.at(-1)!;
    const run = await runAbc('robot.Walk(5);', boss.scene(''));
    expect(run.fell).toBe(true);
    expect(momentOf(boss, run)?.id).toBe('pit');
  });

  it('wrong answers do not pass', async () => {
    setLocale(locale, false);
    const lvl = (id: string) => ABC_LEVELS.find((l) => l.id === id)!;
    const fails: [string, string][] = [
      ['abc-parens', 'robot.Jump();\nrobot.Jump();\nrobot.Jump();'], // goal 2 needs ONE command
      ['abc-assign', 'int coins = 6;\nrobot.Say(5);\nrobot.Say(coins);'],
      ['abc-comment', 'robot.Walk(3);\nrobot.Jump();'], // the line was deleted, not commented
      ['abc-dot', 'robot.Wave();\ncat.Jump();'],
    ];
    for (const [id, src] of fails) {
      const l = lvl(id);
      const run = await runAbc(src, l.scene(src));
      expect(l.goals.every((g) => g.check(run)), id).toBe(false);
    }
  });
});
