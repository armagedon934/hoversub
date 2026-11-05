// Campaign "Shooter from zero": every mission's finished script compiles, runs, and — played by the
// built-in "show me" demo — completes all goals in the game. The starter has blanks and cannot run.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { lintCSharp } from '../src/code/workshop/lint';
import { FREE_PLAY_SCRIPTS, MISSIONS, answerOf, blanksOf, checkGoals, matchLevel, openBlanks, starterOf, startMission, type MissionRun } from '../src/code/run/shooter';
import { World3D } from '../src/code/run/unity3d';

for (const loc of ['ru', 'en'] as const) {
  describe(`Shooter campaign (${loc})`, () => {
    it('has 32 missions in 6 chapters, each with blanks, goals and texts', () => {
      setLocale(loc, false);
      expect(MISSIONS.length).toBe(32);
      expect(new Set(MISSIONS.map((m) => m.chapter))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
      for (const m of MISSIONS) {
        const b = blanksOf(m);
        expect(b.length, m.id).toBeGreaterThanOrEqual(1);
        expect(b.length, m.id).toBeLessThanOrEqual(5);
        expect(openBlanks(starterOf(m)), m.id).toBe(b.length);
        expect(openBlanks(answerOf(m)), m.id).toBe(0);
        expect(m.goals.length).toBeGreaterThan(0);
        expect(m.words.length).toBeGreaterThan(0);
        expect(m.hints.length).toBeGreaterThan(0);
      }
    });

    for (const m of MISSIONS) {
      it(`${m.id}: the answer completes all goals (${m.title.en})`, async () => {
        setLocale(loc, false);
        const code = answerOf(m);
        expect(lintCSharp(code, m.file).filter((f) => f.severity === 'error'), 'lint').toEqual([]);
        const { world, problems } = await startMission(m, code);
        expect(problems, 'compile').toBeNull();
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
        expect(done, `${m.id} goals; logs: ${world.logs.slice(-4).map((l) => l.text).join(' | ')}`).toEqual(m.goals.map(() => true));
      }, 60_000);
    }
  });
}

describe('Shooter campaign: starters and free play', () => {
  it('free play: all finished scripts load together and the match runs', async () => {
    setLocale('ru', false);
    const scripts = FREE_PLAY_SCRIPTS();
    const lvl = matchLevel('free', scripts.slice(1).map((s) => ({ source: s.source, on: s.on })));
    const w = new World3D(lvl);
    expect(await w.load(scripts[0].source, scripts[0].on)).toBeNull();
    const r = w.simulate(3, [{ until: 1e9, keys: ['w'] }]);
    expect(r.status === 'error' ? r.message : 'ok').toBe('ok');
    expect(w.ui.some((u) => /Врагов|⏱/.test(u.text))).toBe(true);
  });
});

describe('Shooter campaign: the goals really need the idea of the mission', () => {
  async function play(id: string, edit: (code: string) => string, seconds?: number) {
    setLocale('en', false);
    const m = MISSIONS.find((x) => x.id === id)!;
    const code = edit(answerOf(m));
    const { world, problems } = await startMission(m, code);
    expect(problems).toBeNull();
    const run: MissionRun = { mem: {}, code };
    let done: boolean[] = [];
    for (let t = 0; t < (seconds ?? m.demoSeconds); t += world.dt) {
      if (world.step(m.demo(t, world, run)).status !== 'playing') break;
      done = checkGoals(m, world, run);
    }
    return done;
  }
  it('s07: moving with Translate goes into the stairs instead of up them', async () => {
    expect(await play('s07', (c) => c.replace('controller.Move(move * speed * Time.deltaTime);', 'transform.Translate(move * speed * Time.deltaTime, Space.World);'))).toEqual([false]);
  });
  it('s09: without sprinting the finish is too late', async () => {
    expect(await play('s09', (c) => c.replace('float speed = running ? runSpeed : walkSpeed;', 'float speed = walkSpeed;'))).toEqual([true, false]);
  });
  it('s09: without crouching the pipe stops you', async () => {
    expect((await play('s09', (c) => c.replace('controller.height = 1f;', 'controller.height = 1.8f;')))[0]).toBe(false);
  });
  it('s14: a single pellet cannot break the armour', async () => {
    expect(await play('s14', (c) => c.replace('public int pellets = 6;', 'public int pellets = 1;'))).toEqual([false]);
  });
  it('s15: the rifle alone cannot take down the far armoured target', async () => {
    expect((await play('s15', (c) => c.replace('current = weapons[1];', 'current = weapons[0];')))[1]).toBe(false);
  });
  it('s17: a bot that sees all around notices you sneaking', async () => {
    expect((await play('s17', (c) => c.replace('> viewAngle) return false;', '> 360f) return false;')))[0]).toBe(false);
  });
  it('s24: legs that swing together are not "in turn"', async () => {
    expect(await play('s24', (c) => c.replace('rightLeg.localRotation = Quaternion.Euler(-swing, 0, 0);', 'rightLeg.localRotation = Quaternion.Euler(swing, 0, 0);'))).toEqual([true, false]);
  });
  it('b2: a bot that snaps with LookAt is too fast', async () => {
    expect((await play('b2', (c) => c.replace(/transform\.rotation = Quaternion\.RotateTowards\(.*\);/, 'transform.rotation = want;')))[1]).toBe(false);
  });
  it('b3: zero reaction time fires at once', async () => {
    expect((await play('b3', (c) => c.replace('public float reactionTime = 0.5f;', 'public float reactionTime = 0f;')))[1]).toBe(false);
  });
  it('b4: an aim that never calms down keeps missing', async () => {
    expect((await play('b4', (c) => c.replace('public float settleSpeed = 1.5f;', 'public float settleSpeed = 0f;')))[1]).toBe(false);
  });
  it('b5: a head that jumps to the angle is not smooth', async () => {
    expect((await play('b5', (c) => c.replace('headYaw = Mathf.LerpAngle(headYaw, targetYaw, turnSpeed * Time.deltaTime);', 'headYaw = targetYaw;')))[1]).toBe(false);
  });
  it('b6: a cheating bot that always walks to the player does not pass', async () => {
    expect((await play('b6', (c) => c.replace('else if (searching)', 'else if (searching)\n        {\n            lastSeen = player.position;\n        }\n        if (searching)')))[1]).toBe(false);
  });
});
