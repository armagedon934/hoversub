// "Mini-Unity": a tiny 2D game world driven by the learner's C# MonoBehaviour script, using the
// real Unity names (Start, Update, OnTriggerEnter2D, transform.position, Input.GetKey,
// Time.deltaTime, Rigidbody2D, Instantiate, Destroy, CompareTag, Debug.Log). The script runs in
// the safe interpreter; this file provides the world, the physics and the Unity API.

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { tr, type Text2 } from '../i18n';
import { CsError, CsProgram, NOT_FOUND, csText, type ClassInfo, type HostV, type ObjV, type V, type VecV } from './csharp';
import { parseCSharp, syntaxProblems, type Problem } from './runner';

export type Sprite = 'hero' | 'coin' | 'wall' | 'enemy' | 'flag' | 'bullet' | 'heart' | 'platform';

export interface ObjSpec {
  name: string;
  tag: string;
  sprite: Sprite;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Built-in behaviour: enemies walking back and forth, bullets flying. */
  patrol?: { dx: number; dy: number; speed: number };
  danger?: boolean;
}

export type Goal =
  | { type: 'reach' }
  | { type: 'collect' }
  | { type: 'destroyAll'; tag: string }
  | { type: 'log'; text: string; afterSeconds?: number }
  | { type: 'field'; field: string; value: number }
  /** Free play (the sandbox): never won, never lost by the rules. */
  | { type: 'free' };

export interface Level {
  id: string;
  icon: string;
  title: Text2;
  task: Text2;
  /** What new idea this level teaches. */
  learn: Text2;
  hint: Text2;
  width: number;
  height: number;
  player: { x: number; y: number; rigidbody?: boolean };
  objects: ObjSpec[];
  goal: Goal;
  starter: string;
  solution: string;
  /** Key presses used by the automatic check of the solution (seconds → keys held). */
  demo: { until: number; keys: string[] }[];
  /** Public fields filled in "from the Inspector" (like dragging a prefab in Unity). */
  inspector?: Record<string, 'bulletPrefab'>;
}

export interface GameObj {
  id: number;
  name: string;
  tag: string;
  sprite: Sprite;
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  danger: boolean;
  vx: number;
  vy: number;
  patrol?: { ox: number; oy: number; dx: number; dy: number; speed: number; t: number };
  bullet?: boolean;
  rigidbody?: { gravityScale: number; grounded: boolean };
}

export interface FrameResult {
  status: 'playing' | 'won' | 'lost' | 'error';
  message?: string;
  error?: Problem;
}

const KEYMAP: Record<string, string> = {
  LeftArrow: 'ArrowLeft',
  RightArrow: 'ArrowRight',
  UpArrow: 'ArrowUp',
  DownArrow: 'ArrowDown',
  Space: ' ',
  A: 'a',
  D: 'd',
  W: 'w',
  S: 's',
  Return: 'Enter',
  Escape: 'Escape',
};

const host = (kind: string, ref: unknown): HostV => ({ k: 'host', kind, ref });
const v3 = (x: number, y: number): VecV => ({ k: 'vec', x, y, z: 0, dim: 3 });

export class UnityWorld {
  objects: GameObj[] = [];
  player!: GameObj;
  program: CsProgram | null = null;
  script: ObjV | null = null;
  cls: ClassInfo | null = null;
  time = 0;
  dt = 1 / 60;
  keys = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  logs: { time: number; text: string }[] = [];
  status: FrameResult['status'] = 'playing';
  message = '';
  private nextId = 1;
  private started = false;
  /** Statements allowed per frame before "endless loop" is reported. */
  frameBudget = 50_000;
  coinsAtStart = 0;
  playerStart = { x: 0, y: 0 };

  constructor(public level: Level) {
    this.reset();
  }

  reset(): void {
    this.objects = [];
    this.nextId = 1;
    const L = this.level;
    this.player = this.add({ name: 'Player', tag: 'Player', sprite: 'hero', x: L.player.x, y: L.player.y, w: 0.8, h: 0.9 });
    if (L.player.rigidbody) this.player.rigidbody = { gravityScale: 1, grounded: false };
    for (const o of L.objects) {
      const g = this.add(o);
      if (o.patrol) g.patrol = { ox: o.x, oy: o.y, dx: o.patrol.dx, dy: o.patrol.dy, speed: o.patrol.speed, t: 0 };
    }
    this.coinsAtStart = this.objects.filter((o) => o.tag === 'Coin').length;
    this.playerStart = { x: L.player.x, y: L.player.y };
    this.time = 0;
    this.logs = [];
    this.status = 'playing';
    this.message = '';
    this.started = false;
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
  }

  private add(o: ObjSpec): GameObj {
    const g: GameObj = { id: this.nextId++, name: o.name, tag: o.tag, sprite: o.sprite, x: o.x, y: o.y, w: o.w ?? (o.sprite === 'coin' ? 0.6 : o.sprite === 'bullet' ? 0.25 : 1), h: o.h ?? (o.sprite === 'coin' ? 0.6 : o.sprite === 'bullet' ? 0.25 : 1), alive: true, danger: !!o.danger, vx: 0, vy: 0 };
    this.objects.push(g);
    return g;
  }

  /** Compiles the script. Returns grammar problems, or null when ready to play. */
  async load(source: string): Promise<Problem[] | null> {
    this.reset();
    const tree = await parseCSharp(source);
    const problems = syntaxProblems(tree, source);
    if (problems.length) return problems;
    const program = new CsProgram(tree, source, { maxSteps: 1_000_000_000, maxDepth: 120, maxTrace: 0, maxOutput: 500 });
    const cls = [...program.classes.values()].find((c) => c.base === 'MonoBehaviour') ?? null;
    if (!cls)
      return [{ line: 0, col: 0, message: tr('No Unity script found: write a class that inherits MonoBehaviour, for example: public class Player : MonoBehaviour { … }', 'Не найден скрипт Unity: нужен класс, который наследует MonoBehaviour, например: public class Player : MonoBehaviour { … }') }];
    program.host = this.makeHost();
    this.program = program;
    this.cls = cls;
    return null;
  }

  private drain(gen: Generator<unknown, V, string | undefined>): V {
    let n = 0;
    for (;;) {
      const r = gen.next();
      if (r.done) return r.value;
      const ev = r.value as { t: string };
      if (ev.t === 'input')
        throw new CsError(tr('Console.ReadLine does not work in a game — use Input.GetKey instead.', 'Console.ReadLine в игре не работает — используй Input.GetKey.'), 0, 'unsupported');
      if (++n > this.frameBudget)
        throw new CsError(tr('One frame took too long: probably an endless loop inside Update (a while-loop that never ends). In Unity this would freeze the whole game.', 'Один кадр выполнялся слишком долго: скорее всего, бесконечный цикл внутри Update (while, который никогда не заканчивается). В Unity от этого зависла бы вся игра.'), 0, 'limit');
    }
  }

  private callScript(method: string, args: V[] = []): void {
    if (!this.program || !this.cls || !this.script) return;
    const m = this.cls.methods.get(method);
    if (!m) return;
    this.program.activate();
    this.drain(this.program.invokeMethod(m[0], this.cls, this.script, args, m[0].startPosition.row) as Generator<unknown, V, string | undefined>);
  }

  /** Advances the game by one frame. */
  frame(): FrameResult {
    if (this.status !== 'playing') return { status: this.status, message: this.message };
    try {
      if (!this.started) {
        this.started = true;
        this.program!.activate();
        // Static fields, then the script object with its field initializers ("Inspector" values).
        const init = this.program!.initStatics();
        for (;;) if (init.next().done) break;
        this.script = this.drain(this.program!.instantiate(this.cls!, [], 0, this.player) as Generator<unknown, V, string | undefined>) as ObjV;
        for (const [field, what] of Object.entries(this.level.inspector ?? {})) {
          const f = this.script.fields.get(field);
          if (f) f.v = host('prefab', what);
        }
        this.callScript('Awake');
        this.callScript('OnEnable');
        this.callScript('Start');
      }
      const before = { x: this.player.x, y: this.player.y };
      this.callScript('Update');
      this.physics(before);
      this.callScript('LateUpdate');
      this.behaviours();
      this.triggers();
      this.time += this.dt;
      this.pressed.clear();
      this.released.clear();
      this.checkGoal();
    } catch (e) {
      this.status = 'error';
      const err = e instanceof CsError ? e : new CsError(String(e instanceof Error ? e.message : e), 0);
      this.message = err.message;
      return { status: 'error', message: err.message, error: { line: err.line, col: 0, message: err.message, code: err.exception } };
    }
    return { status: this.status, message: this.message };
  }

  // -------------------------------------------------------------------------- physics

  private overlaps(a: GameObj, b: GameObj): boolean {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }

  private solidHit(o: GameObj): boolean {
    if (o.x - o.w / 2 < 0 || o.x + o.w / 2 > this.level.width || o.y - o.h / 2 < 0 || o.y + o.h / 2 > this.level.height) return true;
    return this.objects.some((w) => w.alive && (w.sprite === 'wall' || w.sprite === 'platform') && w !== o && this.overlaps(o, w));
  }

  private physics(before: { x: number; y: number }): void {
    const p = this.player;
    const rb = p.rigidbody;
    if (rb) {
      p.vy -= 9.81 * rb.gravityScale * this.dt;
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
    }
    // Walls stop the hero: undo the part of the move that went into a wall.
    if (this.solidHit(p)) {
      const after = { x: p.x, y: p.y };
      p.y = before.y;
      if (this.solidHit(p)) {
        p.x = before.x;
        p.y = after.y;
        if (this.solidHit(p)) p.y = before.y;
        else if (rb) p.vx = 0;
      } else if (rb) {
        rb.grounded = after.y < before.y;
        p.vy = 0;
      }
      if (rb && !this.solidHit(p)) {
        // Keep ground contact information for jumps.
        const probe = { ...p, y: p.y - 0.05 };
        rb.grounded = this.solidHit(probe as GameObj);
      }
    } else if (rb) rb.grounded = this.solidHit({ ...p, y: p.y - 0.05 } as GameObj);
  }

  private behaviours(): void {
    for (const o of this.objects) {
      if (!o.alive) continue;
      if (o.patrol) {
        o.patrol.t += this.dt * o.patrol.speed;
        const k = (Math.sin(o.patrol.t) + 1) / 2;
        o.x = o.patrol.ox + o.patrol.dx * k;
        o.y = o.patrol.oy + o.patrol.dy * k;
      }
      if (o.bullet) {
        o.x += o.vx * this.dt;
        o.y += o.vy * this.dt;
        if (o.x < -1 || o.y < -1 || o.x > this.level.width + 1 || o.y > this.level.height + 1) o.alive = false;
        for (const t of this.objects)
          if (t.alive && t.tag === 'Enemy' && this.overlaps(o, t)) {
            t.alive = false;
            o.alive = false;
          }
        if (o.alive && this.objects.some((w) => w.alive && w.sprite === 'wall' && this.overlaps(o, w))) o.alive = false;
      }
    }
    this.objects = this.objects.filter((o) => o.alive || o === this.player);
  }

  private triggers(): void {
    const p = this.player;
    for (const o of [...this.objects]) {
      if (o === p || !o.alive || o.bullet || o.sprite === 'wall' || o.sprite === 'platform') continue;
      if (!this.overlaps(p, o)) continue;
      const had = this.cls?.methods.has('OnTriggerEnter2D');
      if (had) this.callScript('OnTriggerEnter2D', [host('collider', o)]);
      if (o.danger && o.alive && this.status === 'playing') {
        this.status = 'lost';
        this.message = tr('The hero touched an enemy. Try again!', 'Герой коснулся врага. Попробуй ещё раз!');
      }
      if (!had && o.tag === 'Coin') {
        // Without OnTriggerEnter2D nothing happens — exactly like Unity.
      }
    }
  }

  private checkGoal(): void {
    if (this.status !== 'playing') return;
    const g = this.level.goal;
    const won = (msg: string) => {
      this.status = 'won';
      this.message = msg;
    };
    switch (g.type) {
      case 'reach': {
        const flag = this.objects.find((o) => o.tag === 'Finish');
        if (flag && this.overlaps(this.player, flag)) won(tr('The hero reached the flag!', 'Герой дошёл до флага!'));
        break;
      }
      case 'collect':
        if (!this.objects.some((o) => o.tag === 'Coin' && o.alive)) won(tr('All coins collected!', 'Все монеты собраны!'));
        break;
      case 'destroyAll':
        if (!this.objects.some((o) => o.tag === g.tag && o.alive)) won(tr('All enemies are gone!', 'Все враги уничтожены!'));
        break;
      case 'log':
        if (this.logs.some((l) => l.text.includes(g.text) && (g.afterSeconds === undefined || l.time >= g.afterSeconds - 0.05))) won(tr('The message appeared in the Console!', 'Сообщение появилось в консоли!'));
        break;
      case 'free':
        break;
      case 'field': {
        const f = this.script?.fields.get(g.field);
        if (f && f.v === g.value) won(tr(`${g.field} = ${g.value}. Done!`, `${g.field} = ${g.value}. Готово!`));
        break;
      }
    }
  }

  /** Public fields of the script, like Unity's Inspector. */
  inspector(): { name: string; value: string }[] {
    if (!this.script) return [];
    return [...this.script.fields.entries()].map(([name, c]) => ({ name, value: csText(c.v, c.type) || (c.v === null ? 'None' : '') }));
  }

  // -------------------------------------------------------------------------- Unity API

  private keyDown(code: V): boolean {
    const name = typeof code === 'object' && code?.k === 'enum' ? code.name : String(code);
    return this.keys.has(KEYMAP[name] ?? name.toLowerCase());
  }

  private keyPressed(code: V): boolean {
    const name = typeof code === 'object' && code?.k === 'enum' ? code.name : String(code);
    return this.pressed.has(KEYMAP[name] ?? name.toLowerCase());
  }

  private makeHost() {
    const world = this;
    const objOf = (v: V): GameObj | null => {
      if (v && typeof v === 'object') {
        if (v.k === 'host' && (v.kind === 'gameObject' || v.kind === 'collider' || v.kind === 'transform')) return v.ref as GameObj;
        if (v.k === 'obj' && v.host) return v.host as GameObj;
      }
      return null;
    };
    return {
      log(text: string) {
        world.logs.push({ time: world.time, text });
      },
      global(name: string, self: ObjV | null): V | typeof NOT_FOUND {
        const me = (self?.host as GameObj | undefined) ?? world.player;
        switch (name) {
          case 'transform':
            return host('transform', me);
          case 'gameObject':
            return host('gameObject', me);
          case 'Time':
            return host('Time', null);
          case 'Input':
            return host('Input', null);
          case 'Quaternion':
          case 'ForceMode2D':
          case 'GameObject':
          case 'Rigidbody2D':
          case 'Collider2D':
            return { k: 'type', name };
          case 'Quaternion.identity':
            return host('quaternion', null);
          case 'ForceMode2D.Impulse':
          case 'ForceMode2D.Force':
            return { k: 'enum', type: 'ForceMode2D', name: name.split('.')[1] };
        }
        return NOT_FOUND;
      },
      call(name: string, args: V[], self: ObjV | null, line: number): V | typeof NOT_FOUND {
        const me = (self?.host as GameObj | undefined) ?? world.player;
        if (name === 'Destroy') {
          const o = objOf(args[0]);
          if (!o) throw new CsError(tr('Destroy needs a game object, for example: Destroy(other.gameObject);', 'Destroy нужен игровой объект, например: Destroy(other.gameObject);'), line);
          if (o === world.player) {
            world.status = 'lost';
            world.message = tr('The hero destroyed itself!', 'Герой уничтожил сам себя!');
          }
          o.alive = false;
          return undefined;
        }
        if (name === 'Instantiate') {
          const pf = args[0];
          if (!pf || typeof pf !== 'object' || pf.k !== 'host' || pf.kind !== 'prefab')
            throw new CsError(tr('Instantiate needs a prefab. In this level the field bulletPrefab is already filled in (as if dragged in the Inspector).', 'Instantiate нужен префаб. На этом уровне поле bulletPrefab уже заполнено (как будто перетащено в Инспекторе).'), line);
          const pos = args[1] && typeof args[1] === 'object' && args[1].k === 'vec' ? args[1] : v3(me.x, me.y);
          const b = world.add({ name: 'Bullet', tag: 'Bullet', sprite: 'bullet', x: pos.x, y: pos.y });
          b.bullet = true;
          b.vy = 8;
          return host('gameObject', b);
        }
        if (/^GetComponent<(Rigidbody2D)>$/.test(name)) {
          if (!me.rigidbody) throw new CsError(tr('This object has no Rigidbody2D, so GetComponent returns null.', 'У этого объекта нет Rigidbody2D, поэтому GetComponent вернёт null.'), line, 'runtime', 'NullReferenceException');
          return host('rigidbody', me);
        }
        if (/^GetComponent</.test(name)) return null;
        return NOT_FOUND;
      },
      get(target: HostV, name: string, line: number): V | typeof NOT_FOUND {
        const o = target.ref as GameObj;
        switch (target.kind) {
          case 'transform':
            if (name === 'position') return v3(o.x, o.y);
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'localScale') return v3(o.w, o.h);
            break;
          case 'gameObject':
            if (name === 'transform') return host('transform', o);
            if (name === 'name') return o.name;
            if (name === 'tag') return o.tag;
            if (name === 'activeSelf') return o.alive;
            break;
          case 'collider':
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'transform') return host('transform', o);
            if (name === 'tag') return o.tag;
            if (name === 'name') return o.name;
            break;
          case 'Time':
            if (name === 'deltaTime' || name === 'fixedDeltaTime') return Math.fround(world.dt);
            if (name === 'time') return Math.fround(world.time);
            break;
          case 'rigidbody':
            if (name === 'velocity' || name === 'linearVelocity') return { k: 'vec', x: o.vx, y: o.vy, z: 0, dim: 2 };
            if (name === 'gravityScale') return o.rigidbody?.gravityScale ?? 1;
            break;
        }
        void line;
        return NOT_FOUND;
      },
      set(target: HostV, name: string, value: V, line: number): boolean {
        const o = target.ref as GameObj;
        if (target.kind === 'transform' && name === 'position') {
          if (!value || typeof value !== 'object' || value.k !== 'vec') throw new CsError(tr('transform.position needs a vector, for example new Vector3(1, 2, 0).', 'transform.position нужен вектор, например new Vector3(1, 2, 0).'), line);
          o.x = value.x;
          o.y = value.y;
          return true;
        }
        if (target.kind === 'rigidbody' && (name === 'velocity' || name === 'linearVelocity') && value && typeof value === 'object' && value.k === 'vec') {
          o.vx = value.x;
          o.vy = value.y;
          return true;
        }
        if (target.kind === 'rigidbody' && name === 'gravityScale' && typeof value === 'number' && o.rigidbody) {
          o.rigidbody.gravityScale = value;
          return true;
        }
        if (target.kind === 'gameObject' && name === 'tag' && typeof value === 'string') {
          o.tag = value;
          return true;
        }
        return false;
      },
      method(target: HostV, name: string, args: V[], line: number): V | typeof NOT_FOUND {
        const o = target.ref as GameObj;
        switch (`${target.kind}.${name}`) {
          case 'Input.GetKey':
            return world.keyDown(args[0]);
          case 'Input.GetKeyDown':
            return world.keyPressed(args[0]);
          case 'Input.GetKeyUp': {
            const nm = args[0] && typeof args[0] === 'object' && args[0].k === 'enum' ? args[0].name : '';
            return world.released.has(KEYMAP[nm] ?? nm.toLowerCase());
          }
          case 'Input.GetAxis':
          case 'Input.GetAxisRaw': {
            const axis = csText(args[0]);
            if (axis === 'Horizontal') return (world.keys.has('ArrowRight') || world.keys.has('d') ? 1 : 0) - (world.keys.has('ArrowLeft') || world.keys.has('a') ? 1 : 0);
            if (axis === 'Vertical') return (world.keys.has('ArrowUp') || world.keys.has('w') ? 1 : 0) - (world.keys.has('ArrowDown') || world.keys.has('s') ? 1 : 0);
            throw new CsError(tr(`Unknown input axis "${axis}". Use "Horizontal" or "Vertical".`, `Неизвестная ось ввода «${axis}». Используй "Horizontal" или "Vertical".`), line);
          }
          case 'transform.Translate': {
            const v = args[0];
            if (v && typeof v === 'object' && v.k === 'vec') {
              o.x += v.x;
              o.y += v.y;
            } else {
              o.x += Number(args[0] ?? 0);
              o.y += Number(args[1] ?? 0);
            }
            return undefined;
          }
          case 'gameObject.CompareTag':
          case 'collider.CompareTag':
          case 'transform.CompareTag':
            return o.tag === csText(args[0]);
          case 'gameObject.SetActive':
            if (args[0] === false) o.alive = false;
            return undefined;
          case 'rigidbody.AddForce': {
            const v = args[0];
            if (v && typeof v === 'object' && v.k === 'vec') {
              const impulse = args[1] && typeof args[1] === 'object' && args[1].k === 'enum' && args[1].name === 'Impulse';
              o.vx += impulse ? v.x : v.x * world.dt;
              o.vy += impulse ? v.y : v.y * world.dt;
            }
            return undefined;
          }
          case 'self.CompareTag':
            return world.player.tag === csText(args[0]);
        }
        return NOT_FOUND;
      },
    };
  }

  /** Simulates the game without drawing (used by the automatic checks). */
  simulate(seconds: number, demo: Level['demo']): FrameResult {
    let r: FrameResult = { status: 'playing' };
    let prev = new Set<string>();
    for (let t = 0; t < seconds && r.status === 'playing'; t += this.dt) {
      const step = demo.find((d) => t < d.until) ?? demo[demo.length - 1];
      const now = new Set(step?.keys ?? []);
      this.keys = now;
      this.pressed = new Set([...now].filter((k) => !prev.has(k)));
      this.released = new Set([...prev].filter((k) => !now.has(k)));
      prev = now;
      r = this.frame();
    }
    return r;
  }
}

export type { SyntaxNode };
