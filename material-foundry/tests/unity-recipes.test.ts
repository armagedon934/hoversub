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

  it('double jump: a second jump in the air, then no more until landing', async () => {
    const w = await world('double-jump');
    run(w, 0.5);
    const press = () => w.simulate(0.05, [{ until: 0.02, keys: [' '] }, { until: 1, keys: [] }]);
    press();
    run(w, 0.25);
    const vyBefore = w.player.vy;
    press();
    expect(w.player.vy).toBeGreaterThan(vyBefore + 2);
    run(w, 0.1);
    const vy2 = w.player.vy;
    press();
    expect(w.player.vy).toBeLessThan(vy2);
  });

  it('dash: Shift moves much farther than walking, then cools down', async () => {
    const w = await world('dash');
    const x0 = w.player.x;
    w.simulate(0.2, [{ until: 0.02, keys: ['Shift'] }, { until: 1, keys: [] }]);
    expect(w.player.x - x0).toBeGreaterThan(2);
    const x1 = w.player.x;
    w.simulate(0.2, [{ until: 0.02, keys: ['Shift'] }, { until: 1, keys: [] }]);
    expect(w.player.x - x1).toBeLessThan(0.1);
  });

  it('respawn: falling below the level brings the hero back to the start', async () => {
    const w = await world('respawn');
    run(w, 0.1);
    const start = { x: w.player.x, y: w.player.y };
    w.player.x = 9;
    w.player.y = -6;
    run(w, 0.05);
    expect(w.player.x).toBeCloseTo(start.x, 3);
    expect(w.logs.some((l) => l.text === 'Respawn!')).toBe(true);
  });

  it('enemy shooter: after 1 s a bullet flies towards the hero and hits him', async () => {
    const w = await world('enemy-shooter');
    expect(w.scriptObj.tag).toBe('Enemy');
    run(w, 1.1);
    const b = w.objects.find((o) => o.tag === 'EnemyBullet')!;
    expect(b).toBeDefined();
    expect(b.vx).toBeLessThan(-3);
    const res = run(w, 3);
    expect(res.status).toBe('lost');
    expect(res.message).toMatch(/bullet/);
  });

  it('homing enemy turns to the hero and comes closer', async () => {
    const w = await world('homing');
    const e = w.scriptObj;
    const d0 = Math.hypot(e.x - w.player.x, e.y - w.player.y);
    run(w, 0.5);
    expect(Math.hypot(e.x - w.player.x, e.y - w.player.y)).toBeLessThan(d0 - 1);
    expect(Math.abs(e.rot!)).toBeGreaterThan(90);
  });

  it('waypoints: the enemy visits the points in a loop (array filled in the Inspector)', async () => {
    const w = await world('waypoints');
    const xs: number[] = [];
    for (let i = 0; i < 40; i++) {
      run(w, 0.25);
      xs.push(w.scriptObj.x);
    }
    expect(Math.min(...xs)).toBeLessThan(6.2);
    expect(Math.max(...xs)).toBeGreaterThan(11.8);
  });

  it('typewriter: the dialogue appears letter by letter', async () => {
    const w = await world('typewriter');
    run(w, 0.2);
    const part = w.ui[0].text;
    expect(part.length).toBeGreaterThan(0);
    expect(part.length).toBeLessThan(26);
    run(w, 2);
    expect(w.ui[0].text).toBe('Hello, hero! Find the key.');
  });

  it('regeneration adds health every second up to the maximum', async () => {
    const w = await world('regen');
    run(w, 3.1);
    expect(field(w, 'health')).toBe(6);
    run(w, 10);
    expect(field(w, 'health')).toBe(10);
  });

  it('coin magnet pulls near coins to the hero', async () => {
    const w = await world('coin-magnet');
    const coin = w.objects.find((o) => o.tag === 'Coin')!;
    w.player.x = coin.x - 2;
    const d0 = Math.abs(coin.x - w.player.x);
    run(w, 0.2);
    expect(Math.abs(coin.x - w.player.x)).toBeLessThan(d0);
  });

  it('combo: quick coins raise the combo, waiting resets it', async () => {
    const w = await world('combo');
    const coins = w.objects.filter((o) => o.tag === 'Coin');
    for (const c of coins.slice(0, 2)) {
      w.player.x = c.x;
      w.player.y = c.y;
      run(w, 0.1);
    }
    expect(field(w, 'combo')).toBe(2);
    expect(field(w, 'score')).toBe(3);
    run(w, 2.5);
    expect(field(w, 'combo')).toBe(0);
  });

  it('collect-all says Victory once when the last coin is gone', async () => {
    const w = await world('collect-all');
    run(w, 0.1);
    for (const c of w.objects.filter((o) => o.tag === 'Coin')) c.alive = false;
    run(w, 0.5);
    expect(w.logs.filter((l) => /Victory/.test(l.text)).length).toBe(1);
  });

  it('enemy turns around when its ray sees something ahead', async () => {
    const w = await world('enemy-turn');
    let turned = false;
    for (let i = 0; i < 40 && !turned; i++) {
      run(w, 0.25);
      turned = w.scriptObj.sx === -1;
    }
    expect(turned).toBe(true);
    expect(w.rays.length).toBe(1);
  });
});
