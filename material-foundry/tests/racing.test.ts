// Campaign "Racing from zero": every lesson's finished script completes all goals when driven by
// the lesson's own "show me" input (keys read by the learner's script), and wrong code does not.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { lintCSharp } from '../src/code/workshop/lint';
import { answerCode, blankAnswers, countBlanks, starterCode } from '../src/code/run/blanks';
import { RACE_MISSIONS, raceFreeLevel, raceFreeScripts } from '../src/code/run/racing';
import { checkGoals, startMission, type Mission, type MissionRun } from '../src/code/run/shooter';
import { World3D } from '../src/code/run/unity3d';

setLocale('ru', false);

async function play(m: Mission, code: string, seconds = m.demoSeconds + 3) {
  const { world, problems } = await startMission(m, code);
  expect(problems, 'compile').toBeNull();
  const run: MissionRun = { mem: {}, code };
  let done: boolean[] = [];
  let status = 'playing';
  let msg = '';
  for (let t = 0; t < seconds && status === 'playing'; t += world.dt) {
    const r = world.step(m.demo(t, world, run));
    status = r.status;
    msg = r.message ?? '';
    done = checkGoals(m, world, run);
    if (done.every(Boolean)) break;
  }
  return { done, status, msg, world, run };
}

describe('Racing campaign', () => {
  it('12 lessons in 4 chapters with 1–5 blanks each', () => {
    expect(RACE_MISSIONS.length).toBe(12);
    expect(new Set(RACE_MISSIONS.map((m) => m.chapter))).toEqual(new Set([1, 2, 3, 4]));
    for (const m of RACE_MISSIONS) {
      const n = blankAnswers(m.code()).length;
      expect(n, m.id).toBeGreaterThanOrEqual(1);
      expect(n, m.id).toBeLessThanOrEqual(5);
      expect(countBlanks(starterCode(m.code()))).toBe(n);
    }
  });
  for (const m of RACE_MISSIONS)
    it(`${m.id}: the answer completes all goals (${m.title.en})`, async () => {
      const code = answerCode(m.code());
      expect(lintCSharp(code, m.file).filter((f) => f.severity === 'error')).toEqual([]);
      const { done, status, msg, world } = await play(m, code);
      expect(status === 'error' ? msg : 'ok').toBe('ok');
      expect(done, `${m.id}: ${world.ui.map((u) => u.text).join(' | ')} ${world.logs.slice(-3).map((l) => l.text).join(' | ')}`).toEqual(m.goals.map(() => true));
    }, 120_000);
  it('wrong code does not pass: no brakes and no air never stops (r3), no grass check (r4), no speed loss on a hit (r5)', async () => {
    const m = (id: string) => RACE_MISSIONS.find((x) => x.id === id)!;
    const r3 = await play(m('r3'), answerCode(m('r3').code()).replace('public float brakeForce = 30f;', 'public float brakeForce = 0f;').replace('public float drag = 0.25f;', 'public float drag = 0f;'));
    expect(r3.done).toEqual([false, false]);
    const r4 = await play(m('r4'), answerCode(m('r4').code()).replace('float limit = OnRoad() ? maxSpeed : grassSpeed;', 'float limit = maxSpeed;'));
    expect(r4.done[1]).toBe(false);
    const r5 = await play(m('r5'), answerCode(m('r5').code()).replace('speed *= 0.4f;', 'speed *= 1f;'));
    expect(r5.done[1]).toBe(false);
  }, 120_000);
  it('free drive: all finished scripts load together with 3 AI cars', async () => {
    const scripts = raceFreeScripts();
    const w = new World3D(raceFreeLevel(scripts.slice(1).map((s) => ({ source: s.source, on: s.on }))));
    expect(await w.load(scripts[0].source, scripts[0].on)).toBeNull();
    const r = w.simulate(4, [{ until: 1e9, keys: ['w'] }]);
    expect(r.status === 'error' ? r.message : 'ok').toBe('ok');
    const ai = w.objects.filter((o) => o.tag === 'AI');
    expect(ai.length).toBe(3);
    expect(ai.every((o) => Math.hypot(o.vel.x, o.vel.z) > 5)).toBe(true);
  }, 60_000);
});
