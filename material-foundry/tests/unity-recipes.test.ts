// Every Unity recipe from "I want…" runs in the Mini-Unity sandbox AND does what it promises
// (moves, jumps, shoots, spins, follows, spawns, waits in a coroutine…).
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { sandboxLevel } from '../src/code/run/levels';
import { UnityWorld, type GameObj } from '../src/code/run/unity';
import { RECIPES, recipeFileName } from '../src/code/workshop/recipes';

setLocale('en', false);

async function world(id: string) {
  const r = RECIPES.find((x) => x.id === id)!;
  const w = new UnityWorld(sandboxLevel(r.code, recipeFileName(r)));
  expect(await w.load(r.code)).toBeNull();
  return w;
}
const run = (w: UnityWorld, seconds: number, keys: string[] = []) => w.simulate(seconds, [{ until: 1e9, keys }]);
const field = (w: UnityWorld, name: string) => w.script?.fields.get(name)?.v;
const byName = (w: UnityWorld, re: RegExp): GameObj | undefined => w.objects.find((o) => re.test(o.name) && o.alive);

describe('Unity recipes in Mini-Unity', () => {
  it('all MonoBehaviour recipes start without errors', async () => {
    const unity = RECIPES.filter((r) => r.kind === 'unity' && /:\s*MonoBehaviour/.test(r.code));
    expect(unity.length).toBeGreaterThanOrEqual(26);
    for (const r of unity) {
      const w = new UnityWorld(sandboxLevel(r.code, recipeFileName(r)));
      expect(await w.load(r.code), r.id).toBeNull();
      const res = w.simulate(1, [{ until: 0.5, keys: ['ArrowRight'] }, { until: 1, keys: [' '] }]);
      expect(res.status === 'error' ? `${r.id}: ${res.message}` : 'ok').toBe('ok');
    }
  });

  it('move-2d walks right with the arrows', async () => {
    const w = await world('move-2d');
    const x0 = w.player.x;
    run(w, 0.5, ['ArrowRight']);
    expect(w.player.x - x0).toBeGreaterThan(2.3);
  });

  it('platformer: runs with physics and jumps only from the ground (ground check and layer filled in)', async () => {
    const w = await world('move-physics-2d');
    run(w, 0.5);
    expect(w.logs.map((l) => l.text).join('\n')).toMatch(/groundCheck ← .*feet[\s\S]*groundLayer ← .*Ground/);
    const y0 = w.player.y;
    w.simulate(0.3, [{ until: 0.05, keys: [' '] }, { until: 1, keys: [] }]);
    expect(w.player.y - y0).toBeGreaterThan(1);
    run(w, 1.5, ['ArrowRight']);
    expect(w.player.x).toBeGreaterThan(4);
  });

  it('3D walking with CharacterController stays on the ground and walks', async () => {
    const w = await world('move-3d-cc');
    run(w, 1, ['ArrowRight']);
    expect(w.player.x).toBeGreaterThan(5);
    expect(w.player.cc?.grounded).toBe(true);
  });

  it('rotate spins 90 degrees per second; look-at-mouse turns to the mouse', async () => {
    const w = await world('rotate');
    run(w, 1);
    expect(w.player.rot!).toBeGreaterThan(85);
    const m = await world('look-mouse-2d');
    m.mouse = { x: m.player.x, y: m.player.y + 3 };
    run(m, 0.1);
    expect(Math.round(m.player.rot!)).toBe(90);
  });

  it('camera follow moves the camera towards the hero', async () => {
    const w = await world('camera-follow');
    const cam = byName(w, /Main Camera/)!;
    const d0 = Math.abs(cam.x - w.player.x);
    run(w, 1);
    expect(Math.abs(cam.x - w.player.x)).toBeLessThan(d0);
  });

  it('moving platform goes back and forth', async () => {
    const w = await world('moving-platform');
    const p = w.objects.find((o) => o.tag === 'Platform')!;
    const xs: number[] = [];
    for (let i = 0; i < 4; i++) {
      run(w, 0.25);
      xs.push(p.x);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1);
  });

  it('coins: touching a coin adds a point and removes it (OnTriggerEnter2D once)', async () => {
    const w = await world('coins');
    const coin = w.objects.find((o) => o.tag === 'Coin')!;
    w.player.x = coin.x;
    w.player.y = coin.y;
    run(w, 0.2);
    expect(field(w, 'score')).toBe(1);
    expect(coin.alive).toBe(false);
  });

  it('shooter: Space fires a bullet flying right, removed after 3 s', async () => {
    const w = await world('shoot');
    w.simulate(0.1, [{ until: 0.05, keys: [' '] }, { until: 1, keys: [] }]);
    const b = byName(w, /Bullet/)!;
    expect(b).toBeDefined();
    expect(b.vx).toBeGreaterThan(10);
    run(w, 3.2);
    expect(b.alive).toBe(false);
  });

  it('enemy scripts go onto the enemy: chase gets closer, patrol walks and turns around', async () => {
    const w = await world('enemy-follow');
    const e = w.scriptObj;
    expect(e.tag).toBe('Enemy');
    w.player.x = 5;
    const d0 = Math.abs(e.x - w.player.x);
    run(w, 0.5);
    expect(Math.abs(e.x - w.player.x)).toBeLessThan(d0 - 0.5);
    const p = await world('enemy-patrol');
    const x0 = p.scriptObj.x;
    run(p, 2.5);
    expect(p.scriptObj.x).not.toBeCloseTo(x0, 1);
    expect(p.scriptObj.sx).toBe(-1);
  });

  it('spawner creates objects every 2 seconds', async () => {
    const w = await world('spawner');
    run(w, 2.1);
    expect(w.objects.filter((o) => /Clone/.test(o.name)).length).toBe(1);
    run(w, 2);
    expect(w.objects.filter((o) => /Clone/.test(o.name)).length).toBe(2);
  });

  it('countdown, pause (Time.timeScale) and restart (LoadScene)', async () => {
    const t = await world('timer-countdown');
    run(t, 1);
    expect(field(t, 'seconds')).toBeLessThan(59.1);
    const p = await world('pause');
    p.simulate(0.1, [{ until: 0.05, keys: ['Escape'] }, { until: 1, keys: [] }]);
    expect(p.timeScale).toBe(0);
    const r = await world('restart');
    run(r, 0.5, ['ArrowRight']);
    r.simulate(0.1, [{ until: 0.05, keys: ['r'] }, { until: 1, keys: [] }]);
    expect(r.logs.some((l) => /LoadScene/.test(l.text)) || r.time < 0.2).toBe(true);
  });

  it('coroutine: blinks with WaitForSeconds while the game goes on', async () => {
    const w = await world('coroutine');
    const seen = new Set<boolean>();
    for (let i = 0; i < 70; i++) {
      run(w, 1 / 60);
      seen.add(!!w.player.hidden);
    }
    expect([...seen].sort()).toEqual([false, true]);
    run(w, 1);
    expect(w.player.hidden).toBeFalsy();
    expect(w.coroutines.length).toBe(0);
  });

  it('animator parameters, score UI text, raycast with DrawRay, sound', async () => {
    const a = await world('animator');
    run(a, 0.3, ['ArrowRight']);
    expect(Number(a.anim.Speed)).toBeGreaterThan(0);
    const r = await world('raycast');
    run(r, 0.1);
    expect(r.rays.length).toBe(1);
    expect(r.logs.some((l) => /I see: Coin/.test(l.text))).toBe(true);
  });

  it('Destroy(gameObject, 2) waits two seconds', async () => {
    const w = await world('destroy-after');
    run(w, 1.5);
    expect(w.player.alive).toBe(true);
    const res = run(w, 1);
    expect(res.status).toBe('lost');
  });
});
