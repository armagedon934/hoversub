// Campaign "Models and materials": every lesson's finished script passes its goals; the engine
// builds primitives, loads generator materials by name, tiles them and switches LOD.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { lintCSharp } from '../src/code/workshop/lint';
import { answerCode, blankAnswers, countBlanks, starterCode } from '../src/code/run/blanks';
import { MODEL_MISSIONS, modelFreeLevel, modelFreeScripts } from '../src/code/run/models';
import { checkGoals, startMission, type MissionRun } from '../src/code/run/shooter';
import { World3D } from '../src/code/run/unity3d';
import { PRESETS } from '../src/engine/presets';

setLocale('ru', false);

describe('Models and materials', () => {
  it('6 lessons with 1–5 blanks; every material name used exists in the texture studio', () => {
    expect(MODEL_MISSIONS.length).toBe(6);
    const ids = new Set(PRESETS.map((p) => p.id));
    for (const m of MODEL_MISSIONS) {
      const n = blankAnswers(m.code()).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      expect(countBlanks(starterCode(m.code()))).toBe(n);
      for (const [, name] of answerCode(m.code()).matchAll(/Load<Material>\("(\w+)"\)/g)) expect(ids.has(name), name).toBe(true);
    }
    expect(ids.has('weathered_brick')).toBe(true);
  });
  for (const m of MODEL_MISSIONS)
    it(`${m.id}: the answer completes all goals (${m.title.en})`, async () => {
      const code = answerCode(m.code());
      expect(lintCSharp(code, m.file).filter((f) => f.severity === 'error')).toEqual([]);
      const { world, problems } = await startMission(m, code);
      expect(problems).toBeNull();
      const run: MissionRun = { mem: {}, code };
      let done: boolean[] = [];
      let status = 'playing';
      let msg = '';
      for (let t = 0; t < m.demoSeconds + 2 && status === 'playing'; t += world.dt) {
        const r = world.step(m.demo(t, world, run));
        status = r.status;
        msg = r.message ?? '';
        done = checkGoals(m, world, run);
        if (done.every(Boolean)) break;
      }
      expect(status === 'error' ? msg : 'ok').toBe('ok');
      expect(done).toEqual(m.goals.map(() => true));
    }, 60_000);
  it('a stretched texture (no tiling) does not pass the tiling lesson', async () => {
    const m = MODEL_MISSIONS.find((x) => x.id === 'm3')!;
    const { world } = await startMission(m, answerCode(m.code()).replace(/r\.material\.mainTextureScale = .*;/, ''));
    world.simulate(0.5, [{ until: 1e9 }]);
    const run: MissionRun = { mem: {}, code: '' };
    expect(checkGoals(m, world, run)).toEqual([true, false]);
  });
  it('the material picker paints every object of a kind, in real size', () => {
    const w = new World3D(modelFreeLevel([]));
    expect(w.paintByName('Crate', 'barn_planks', 1.2)).toBe(2);
    expect(w.objects.filter((o) => o.name === 'Crate').every((o) => o.material?.id === 'barn_planks' && o.material.mode === 'world')).toBe(true);
    w.paintByName('Floor', 'slate_floor', 3);
    expect(w.floorMat?.id).toBe('slate_floor');
  });
  it('free scene: the scripts load together', async () => {
    const s = modelFreeScripts();
    const w = new World3D(modelFreeLevel(s.slice(1).map((x) => ({ source: x.source, on: x.on }))));
    expect(await w.load(s[0].source, s[0].on)).toBeNull();
    const r = w.simulate(1, [{ until: 1e9 }]);
    expect(r.status === 'error' ? r.message : 'ok').toBe('ok');
  });
});
