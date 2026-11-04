// "Mini-Unity": a tiny 2D game world driven by the learner's C# MonoBehaviour script, using the
// real Unity names (Start, Update, OnTriggerEnter2D, transform.position, Input.GetKey,
// Time.deltaTime, Rigidbody2D, Instantiate, Destroy, CompareTag, Debug.Log). The script runs in
// the safe interpreter; this file provides the world, the physics and the Unity API.

import type { Node as SyntaxNode } from 'web-tree-sitter';
import { tr, type Text2 } from '../i18n';
import { CsError, CsProgram, NOT_FOUND, csText, type ClassInfo, type CoroutineRef, type HostV, type ObjV, type V, type VecV } from './csharp';
import { parseCSharp, syntaxProblems, type Problem } from './runner';

/** 'point' and 'none' are invisible helpers (a ground check, a fire point, a UI panel…). */
export type Sprite = 'hero' | 'coin' | 'wall' | 'enemy' | 'flag' | 'bullet' | 'heart' | 'platform' | 'point' | 'none';

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
  /** Tag of the object the script is put on (default: the hero). */
  attach?: string;
  /** Fill empty reference fields with sensible objects, as if dragged in the Inspector (sandbox). */
  autoInspector?: boolean;
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
  /** Rotation around Z in degrees, scale factors (negative = mirrored), SpriteRenderer state. */
  rot?: number;
  sx?: number;
  sy?: number;
  hidden?: boolean;
  flipX?: boolean;
  /** Child objects (a ground check, a fire point) follow their parent. */
  parent?: { obj: GameObj; dx: number; dy: number };
  destroyAt?: number;
  /** CharacterController state. */
  cc?: { grounded: boolean };
}

interface Coroutine {
  gen: Generator<unknown, V, string | undefined>;
  until: number;
  frame: number;
  done: boolean;
}

/** Pixels per world unit for Input.mousePosition / Camera.ScreenToWorldPoint. */
export const PPU = 50;
const SOLID = new Set<Sprite>(['wall', 'platform']);
const GHOST = new Set<Sprite>(['point', 'none']);

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
  LeftShift: 'Shift',
  RightShift: 'Shift',
  LeftControl: 'Control',
  RightControl: 'Control',
  Tab: 'Tab',
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
  /** The object the script is attached to (usually the hero). */
  scriptObj!: GameObj;
  coroutines: Coroutine[] = [];
  invokes: { name: string; at: number; every?: number }[] = [];
  mouse = { x: 0, y: 0 };
  mouseDown = new Set<number>();
  mousePressed = new Set<number>();
  mouseReleased = new Set<number>();
  timeScale = 1;
  /** PlayerPrefs live as long as the page (not written to disk). */
  prefs = new Map<string, V>();
  anim: Record<string, string> = {};
  rays: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  ui: { name: string; text: string; slider?: { value: number; max: number } }[] = [];
  private overlapping = new Set<number>();
  private reloadRequested = false;
  private frameNo = 0;

  /** Game time step (Time.deltaTime): 0 while paused with Time.timeScale = 0. */
  get sdt(): number {
    return this.dt * this.timeScale;
  }

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
    this.scriptObj = (L.attach && this.objects.find((o) => o.tag === L.attach)) || this.player;
    if (this.scriptObj !== this.player) this.scriptObj.patrol = undefined;
    this.coroutines = [];
    this.invokes = [];
    this.anim = {};
    this.rays = [];
    this.ui = [];
    this.overlapping = new Set();
    this.timeScale = 1;
    this.mouseDown.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
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
      if (ev.t === 'wait') throw new CsError(tr('"yield return" only works inside a coroutine started with StartCoroutine(…).', '«yield return» работает только внутри корутины, запущенной через StartCoroutine(…).'), 0, 'runtime');
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
    const r = this.drain(this.program.invokeMethod(m[0], this.cls, this.script, args, m[0].startPosition.row) as Generator<unknown, V, string | undefined>);
    // IEnumerator Start() is a coroutine in Unity.
    if (r && typeof r === 'object' && r.k === 'host' && r.kind === 'coroutine') this.startCoroutine(r, m[0].startPosition.row);
  }

  // -------------------------------------------------------------------------- coroutines, Invoke

  private startCoroutine(v: V, line: number): V {
    let ref: CoroutineRef | null = null;
    if (v && typeof v === 'object' && v.k === 'host' && v.kind === 'coroutine') ref = v.ref as CoroutineRef;
    else if (typeof v === 'string' && this.cls) {
      const m = this.cls.methods.get(v);
      if (m) ref = { method: m[0], cls: this.cls, self: this.script, args: [], line };
    }
    if (!ref) throw new CsError(tr('StartCoroutine needs a method that returns IEnumerator, for example: StartCoroutine(Blink());', 'StartCoroutine нужен метод, который возвращает IEnumerator, например: StartCoroutine(Blink());'), line);
    this.program!.activate();
    const co: Coroutine = { gen: this.program!.invokeMethod(ref.method, ref.cls, ref.self, ref.args, ref.line, true) as Generator<unknown, V, string | undefined>, until: this.time, frame: this.frameNo, done: false };
    this.coroutines.push(co);
    // Like Unity: the coroutine runs at once until its first "yield return".
    this.stepCoroutine(co);
    return host('coroutineHandle', co);
  }

  private stepCoroutine(co: Coroutine): void {
    co.frame = this.frameNo;
    let n = 0;
    for (;;) {
      const r = co.gen.next();
      if (r.done) {
        co.done = true;
        return;
      }
      const ev = r.value as { t: string; value?: V };
      if (ev.t === 'wait') {
        const w = ev.value;
        co.until = this.time + (w && typeof w === 'object' && w.k === 'host' && w.kind === 'wait' ? (w.ref as number) : 0);
        return;
      }
      if (ev.t === 'input') throw new CsError(tr('Console.ReadLine does not work in a game.', 'Console.ReadLine в игре не работает.'), 0, 'unsupported');
      if (++n > this.frameBudget)
        throw new CsError(tr('A coroutine ran too long without "yield return" — probably an endless loop. Put yield return null; inside the loop.', 'Корутина слишком долго работала без «yield return» — скорее всего, бесконечный цикл. Добавь yield return null; внутрь цикла.'), 0, 'limit');
    }
  }

  private runCoroutines(): void {
    for (const co of [...this.coroutines]) if (!co.done && co.frame !== this.frameNo && co.until <= this.time + 1e-9) this.stepCoroutine(co);
    this.coroutines = this.coroutines.filter((c) => !c.done);
  }

  private runInvokes(): void {
    for (const inv of [...this.invokes]) {
      if (inv.at > this.time + 1e-9) continue;
      if (inv.every && inv.every > 0) inv.at += inv.every;
      else this.invokes.splice(this.invokes.indexOf(inv), 1);
      this.callScript(inv.name);
    }
  }

  // -------------------------------------------------------------------------- helpers

  /** Children (ground check, fire point) follow their parent, mirrored with it. */
  private followParents(): void {
    for (const o of this.objects) {
      if (!o.parent) continue;
      const p = o.parent.obj;
      const dir = (p.sx ?? 1) < 0 || p.flipX ? -1 : 1;
      o.x = p.x + o.parent.dx * dir;
      o.y = p.y + o.parent.dy;
      o.rot = p.rot;
      o.sx = dir;
      if (!p.alive) o.alive = false;
    }
  }

  /** Like dragging objects into empty Inspector fields; every choice is written to the Console. */
  private autoInspector(): void {
    const me = this.scriptObj;
    const note = (field: string, what: string) => this.logs.push({ time: 0, text: tr(`Inspector: ${field} ← ${what}`, `Inspector: ${field} ← ${what}`) });
    const point = (name: string, x: number, y: number, parent?: { dx: number; dy: number }) => {
      const g = this.add({ name, tag: 'Untagged', sprite: 'point', x, y, w: 0.1, h: 0.1 });
      if (parent) g.parent = { obj: me, ...parent };
      return g;
    };
    const flag = this.objects.find((o) => o.tag === 'Finish');
    const shooter = /Shoot|Gun|Weapon|Fire/i.test(this.cls?.name ?? '');
    for (const [name, cell] of this.script!.fields) {
      if (cell.v !== null && cell.v !== undefined) continue;
      const t = cell.type.replace(/^UnityEngine\./, '');
      if (t === 'Transform') {
        if (/ground|feet|foot|check/i.test(name)) {
          cell.v = host('transform', point(name, me.x, me.y - me.h / 2 - 0.05, { dx: 0, dy: -me.h / 2 - 0.05 }));
          note(name, tr('a point at the hero\'s feet', 'точка у ног героя'));
        } else if (/fire|muzzle|gun|shoot|barrel/i.test(name)) {
          cell.v = host('transform', point(name, me.x + me.w / 2 + 0.2, me.y, { dx: me.w / 2 + 0.2, dy: 0 }));
          note(name, tr('a point in front of the hero', 'точка перед героем'));
        } else if (/pointA|left|start|from/i.test(name)) {
          cell.v = host('transform', point(name, me.x - 3, me.y));
          note(name, tr('a point 3 units to the left', 'точка на 3 единицы левее'));
        } else if (/pointB|right|end|to$/i.test(name)) {
          cell.v = host('transform', point(name, me.x + 3, me.y));
          note(name, tr('a point 3 units to the right', 'точка на 3 единицы правее'));
        } else if (/target|player|hero|follow/i.test(name)) {
          const target = me === this.player ? (flag ?? this.player) : this.player;
          cell.v = host('transform', target);
          note(name, target === this.player ? tr('the hero', 'герой') : tr('the flag', 'флаг'));
        } else {
          cell.v = host('transform', point(name, me.x, me.y));
          note(name, tr('an empty point', 'пустая точка'));
        }
      } else if (/^(GameObject|Rigidbody2D)$/.test(t) && /prefab|bullet|projectile|shot|enemy|coin/i.test(name)) {
        const kind = /enemy/i.test(name) ? 'enemy' : /coin/i.test(name) ? 'coin' : /bullet|projectile|shot/i.test(name) || shooter ? 'bulletPrefab' : 'coin';
        cell.v = host('prefab', kind);
        note(name, kind === 'enemy' ? tr('an enemy prefab', 'префаб врага') : kind === 'coin' ? tr('a coin prefab', 'префаб монеты') : tr('a bullet prefab', 'префаб пули'));
      } else if (t === 'GameObject' && /player|hero|target/i.test(name)) {
        cell.v = host('gameObject', this.player);
        note(name, tr('the hero', 'герой'));
      } else if (t === 'GameObject') {
        const g = this.add({ name, tag: 'Untagged', sprite: 'none', x: 0, y: 0, w: 0.1, h: 0.1 });
        g.hidden = true;
        cell.v = host('gameObject', g);
        note(name, tr('an empty object (in Unity drag your own object here)', 'пустой объект (в Unity перетащи сюда свой объект)'));
      } else if (t === 'LayerMask') {
        cell.v = host('layermask', 'Ground');
        note(name, tr('the layer "Ground" (platforms and the floor)', 'слой «Ground» (платформы и пол)'));
      } else if (/^(TMP_Text|TextMeshProUGUI|Text)$/.test(t)) {
        const u = { name, text: '' };
        this.ui.push(u);
        cell.v = host('uitext', u);
        note(name, tr('a text on the screen', 'текст на экране'));
      } else if (t === 'Slider') {
        const u = { name, text: '', slider: { value: 1, max: 1 } };
        this.ui.push(u);
        cell.v = host('slider', u);
        note(name, tr('a bar on the screen', 'полоска на экране'));
      } else if (t === 'AudioClip') {
        cell.v = host('clip', name);
        note(name, tr('a sound', 'звук'));
      } else if (t === 'Animator') {
        cell.v = host('animator', me);
      } else if (t === 'SpriteRenderer') {
        cell.v = host('sprite', me);
      }
    }
  }

  /** Moves an object by (dx, dy), stopped by walls and platforms; returns true when it touched the ground. */
  private moveWithCollisions(o: GameObj, dx: number, dy: number): boolean {
    let grounded = false;
    o.x += dx;
    if (this.solidHit(o)) o.x -= dx;
    o.y += dy;
    if (this.solidHit(o)) {
      o.y -= dy;
      if (dy < 0) grounded = true;
    }
    if (!grounded) grounded = this.solidHit({ ...o, y: o.y - 0.05 } as GameObj);
    return grounded;
  }

  private rightOf(o: GameObj): { x: number; y: number } {
    const a = ((o.rot ?? 0) * Math.PI) / 180;
    const dir = (o.sx ?? 1) < 0 || o.flipX ? -1 : 1;
    return { x: Math.cos(a) * dir, y: Math.sin(a) * dir };
  }

  private spawnPrefab(kind: string, x: number, y: number): GameObj {
    if (kind === 'enemy') return this.add({ name: 'Enemy(Clone)', tag: 'Enemy', sprite: 'enemy', x, y, danger: true });
    if (kind === 'coin') return this.add({ name: 'Coin(Clone)', tag: 'Coin', sprite: 'coin', x, y });
    const b = this.add({ name: 'Bullet(Clone)', tag: 'Bullet', sprite: 'bullet', x, y });
    b.bullet = true;
    b.vy = 8;
    return b;
  }

  private componentOf(type: string, o: GameObj, line: number): V {
    switch (type) {
      case 'Rigidbody2D':
        if (!o.rigidbody && o === this.player) throw new CsError(tr('This object has no Rigidbody2D, so GetComponent returns null.', 'У этого объекта нет Rigidbody2D, поэтому GetComponent вернёт null.'), line, 'runtime', 'NullReferenceException');
        return o.rigidbody || o.bullet ? host('rigidbody', o) : null;
      case 'Transform':
        return host('transform', o);
      case 'SpriteRenderer':
        return host('sprite', o);
      case 'Animator':
        return host('animator', o);
      case 'AudioSource':
        return host('audio', o);
      case 'CharacterController':
        o.cc ??= { grounded: false };
        return host('cc', o);
      case 'Collider2D':
      case 'BoxCollider2D':
      case 'CircleCollider2D':
      case 'CapsuleCollider2D':
        return host('collider', o);
    }
    if (this.cls && type === this.cls.name && o === this.scriptObj) return this.script;
    return null;
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
        this.script = this.drain(this.program!.instantiate(this.cls!, [], 0, this.scriptObj) as Generator<unknown, V, string | undefined>) as ObjV;
        for (const [field, what] of Object.entries(this.level.inspector ?? {})) {
          const f = this.script.fields.get(field);
          if (f) f.v = host('prefab', what);
        }
        if (this.level.autoInspector) this.autoInspector();
        this.callScript('Awake');
        this.callScript('OnEnable');
        this.callScript('Start');
      }
      this.frameNo++;
      this.rays = [];
      this.followParents();
      const before = { x: this.player.x, y: this.player.y };
      this.callScript('FixedUpdate');
      this.callScript('Update');
      this.runInvokes();
      this.runCoroutines();
      this.physics(before);
      this.followParents();
      this.callScript('LateUpdate');
      this.behaviours();
      this.triggers();
      this.time += this.sdt;
      this.pressed.clear();
      this.released.clear();
      this.mousePressed.clear();
      this.mouseReleased.clear();
      this.checkGoal();
      if (this.reloadRequested) {
        this.reloadRequested = false;
        this.reset();
      }
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
    return this.objects.some((w) => w.alive && SOLID.has(w.sprite) && w !== o && this.overlaps(o, w));
  }

  private physics(before: { x: number; y: number }): void {
    const p = this.player;
    const rb = p.rigidbody;
    if (rb) {
      p.vy -= 9.81 * rb.gravityScale * this.sdt;
      p.x += p.vx * this.sdt;
      p.y += p.vy * this.sdt;
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
      if (o.destroyAt !== undefined && o.destroyAt <= this.time + 1e-9) {
        o.alive = false;
        if (o === this.player && this.status === 'playing') {
          this.status = 'lost';
          this.message = tr('The hero was destroyed (Destroy).', 'Герой уничтожен (Destroy).');
        }
        continue;
      }
      if (o.patrol) {
        o.patrol.t += this.sdt * o.patrol.speed;
        const k = (Math.sin(o.patrol.t) + 1) / 2;
        o.x = o.patrol.ox + o.patrol.dx * k;
        o.y = o.patrol.oy + o.patrol.dy * k;
      }
      if (o.bullet) {
        o.x += o.vx * this.sdt;
        o.y += o.vy * this.sdt;
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
    // OnTriggerEnter2D once when something starts touching the script's object, OnTriggerExit2D when it stops.
    const me = this.scriptObj;
    const now = new Set<number>();
    for (const o of [...this.objects]) {
      if (o === me || !o.alive || SOLID.has(o.sprite) || GHOST.has(o.sprite) || o.parent?.obj === me) continue;
      if (o.bullet && me === this.player) continue;
      if (!this.overlaps(me, o)) continue;
      now.add(o.id);
      if (!this.overlapping.has(o.id)) this.callScript('OnTriggerEnter2D', [host('collider', o)]);
      else this.callScript('OnTriggerStay2D', [host('collider', o)]);
    }
    for (const id of this.overlapping) {
      if (now.has(id)) continue;
      const o = this.objects.find((x) => x.id === id);
      if (o) this.callScript('OnTriggerExit2D', [host('collider', o)]);
    }
    this.overlapping = now;
    // The hero touching anything dangerous loses (whatever the script does).
    const p = this.player;
    if (this.status === 'playing' && p.alive && this.objects.some((o) => o !== p && o.alive && o.danger && this.overlaps(p, o))) {
      this.status = 'lost';
      this.message = tr('The hero touched an enemy. Try again!', 'Герой коснулся врага. Попробуй ещё раз!');
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
    if (/^Mouse[0-2]$/.test(name)) return this.mouseDown.has(Number(name[5]));
    if (/^Alpha\d$/.test(name)) return this.keys.has(name[5]);
    return this.keys.has(KEYMAP[name] ?? (name === 'space' ? ' ' : name.toLowerCase()));
  }

  private keyPressed(code: V): boolean {
    const name = typeof code === 'object' && code?.k === 'enum' ? code.name : String(code);
    if (/^Mouse[0-2]$/.test(name)) return this.mousePressed.has(Number(name[5]));
    if (/^Alpha\d$/.test(name)) return this.pressed.has(name[5]);
    return this.pressed.has(KEYMAP[name] ?? (name === 'space' ? ' ' : name.toLowerCase()));
  }

  private makeHost() {
    const world = this;
    const objOf = (v: V): GameObj | null => {
      if (v && typeof v === 'object') {
        if (v.k === 'host' && ['gameObject', 'collider', 'transform', 'instance', 'rigidbody', 'sprite'].includes(v.kind)) return v.ref as GameObj;
        if (v.k === 'obj' && v.host) return v.host as GameObj;
      }
      return null;
    };
    const vecOf = (v: V): VecV | null => (v && typeof v === 'object' && v.k === 'vec' ? v : null);
    const num = (v: V, d = 0) => (typeof v === 'number' ? v : d);
    const keyOfButton = (name: string) => (name === 'Jump' ? ' ' : name === 'Fire1' ? 'Control' : name === 'Submit' ? 'Enter' : name === 'Cancel' ? 'Escape' : name.toLowerCase());
    const fireDown = (name: string, set: Set<string>, mouse: Set<number>) => (name === 'Fire1' ? set.has('Control') || mouse.has(0) : set.has(keyOfButton(name)));
    const angleOf = (v: V): number => (v && typeof v === 'object' && v.k === 'host' && v.kind === 'quat' ? (v.ref as number) : 0);
    const notInScene = (what: string, line: number) =>
      new CsError(tr(`${what} is not part of Mini-Unity yet. In the real Unity this line works.`, `${what} пока нет в Мини-Unity. В настоящей Unity эта строка работает.`), line, 'unsupported');
    return {
      log(text: string) {
        world.logs.push({ time: world.time, text });
      },
      global(name: string, self: ObjV | null): V | typeof NOT_FOUND {
        const me = (self?.host as GameObj | undefined) ?? world.scriptObj ?? world.player;
        switch (name) {
          case 'transform':
            return host('transform', me);
          case 'gameObject':
            return host('gameObject', me);
          case 'enabled':
            return true;
          case 'Time':
            return host('Time', null);
          case 'Input':
            return host('Input', null);
          case 'Quaternion':
          case 'ForceMode2D':
          case 'GameObject':
          case 'Rigidbody2D':
          case 'Collider2D':
          case 'Physics2D':
          case 'Camera':
          case 'Application':
          case 'SceneManager':
          case 'PlayerPrefs':
          case 'Object':
            return { k: 'type', name };
          case 'Quaternion.identity':
            return host('quat', 0);
          case 'Camera.main':
            return host('camera', null);
          case 'ForceMode2D.Impulse':
          case 'ForceMode2D.Force':
            return { k: 'enum', type: 'ForceMode2D', name: name.split('.')[1] };
        }
        return NOT_FOUND;
      },
      create(type: string, args: V[]): V | typeof NOT_FOUND {
        if (type === 'WaitForSeconds' || type === 'WaitForSecondsRealtime') return host('wait', num(args[0]));
        if (type === 'WaitForEndOfFrame' || type === 'WaitForFixedUpdate') return host('wait', 0);
        if (type === 'GameObject') {
          const g = world.add({ name: typeof args[0] === 'string' ? args[0] : 'New Game Object', tag: 'Untagged', sprite: 'none', x: 0, y: 0, w: 0.1, h: 0.1 });
          return host('gameObject', g);
        }
        return NOT_FOUND;
      },
      call(name: string, args: V[], self: ObjV | null, line: number): V | typeof NOT_FOUND {
        const me = (self?.host as GameObj | undefined) ?? world.scriptObj ?? world.player;
        if (name === 'Destroy' || name === 'DestroyImmediate') {
          const o = objOf(args[0]);
          if (args[0] && typeof args[0] === 'object' && args[0].k === 'obj') return undefined; // destroying the script component itself
          if (!o) throw new CsError(tr('Destroy needs a game object, for example: Destroy(other.gameObject);', 'Destroy нужен игровой объект, например: Destroy(other.gameObject);'), line);
          if (typeof args[1] === 'number' && args[1] > 0) {
            o.destroyAt = world.time + args[1];
            return undefined;
          }
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
          const pos = vecOf(args[1]) ?? (args[1] && typeof args[1] === 'object' && args[1].k === 'host' && args[1].kind === 'transform' ? v3((args[1].ref as GameObj).x, (args[1].ref as GameObj).y) : v3(me.x, me.y));
          const b = world.spawnPrefab(String(pf.ref), pos.x, pos.y);
          b.rot = angleOf(args[2]);
          return host('instance', b);
        }
        if (name === 'StartCoroutine') return world.startCoroutine(args[0], line);
        if (name === 'StopAllCoroutines' || name === 'StopCoroutine') {
          if (name === 'StopAllCoroutines') world.coroutines = [];
          else {
            const h = args[0];
            if (h && typeof h === 'object' && h.k === 'host' && h.kind === 'coroutineHandle') (h.ref as Coroutine).done = true;
          }
          return undefined;
        }
        if (name === 'Invoke') {
          world.invokes.push({ name: csText(args[0]), at: world.time + num(args[1]) });
          return undefined;
        }
        if (name === 'InvokeRepeating') {
          world.invokes.push({ name: csText(args[0]), at: world.time + num(args[1]), every: Math.max(0.02, num(args[2], 1)) });
          return undefined;
        }
        if (name === 'CancelInvoke') {
          world.invokes = args.length ? world.invokes.filter((i) => i.name !== csText(args[0])) : [];
          return undefined;
        }
        const gc = /^(?:GetComponent|GetComponentInChildren|GetComponentInParent)<(\w+)>$/.exec(name);
        if (gc) return world.componentOf(gc[1], me, line);
        if (/^AddComponent<(\w+)>$/.test(name)) {
          const t = /<(\w+)>/.exec(name)![1];
          if (t === 'Rigidbody2D') me.rigidbody ??= { gravityScale: 1, grounded: false };
          return world.componentOf(t, me, line);
        }
        if (name === 'print') {
          world.logs.push({ time: world.time, text: csText(args[0]) });
          return undefined;
        }
        return NOT_FOUND;
      },
      static(type: string, name: string, args: V[], line: number): V | typeof NOT_FOUND {
        switch (`${type}.${name}`) {
          case 'GameObject.FindWithTag':
          case 'GameObject.FindGameObjectWithTag': {
            const o = world.objects.find((x) => x.alive && x.tag === csText(args[0]));
            return o ? host('gameObject', o) : null;
          }
          case 'GameObject.Find': {
            const o = world.objects.find((x) => x.alive && x.name === csText(args[0]));
            return o ? host('gameObject', o) : null;
          }
          case 'GameObject.FindGameObjectsWithTag':
            return { k: 'arr', items: world.objects.filter((x) => x.alive && x.tag === csText(args[0])).map((o) => host('gameObject', o)), elem: 'GameObject' };
          case 'Object.Destroy':
          case 'Object.Instantiate':
            return this.call!(name, args, null, line);
          case 'Physics2D.OverlapCircle':
          case 'Physics2D.OverlapPoint': {
            const p = vecOf(args[0]);
            if (!p) return null;
            const r = name === 'OverlapPoint' ? 0.01 : num(args[1], 0.1);
            const hit = world.objects.find((o) => o.alive && SOLID.has(o.sprite) && Math.abs(p.x - o.x) <= o.w / 2 + r && Math.abs(p.y - o.y) <= o.h / 2 + r);
            return hit ? host('collider', hit) : null;
          }
          case 'Physics2D.Raycast': {
            const o = vecOf(args[0]);
            const d = vecOf(args[1]);
            if (!o || !d) return host('hit', { collider: null, x: 0, y: 0, distance: 0 });
            const len = Math.hypot(d.x, d.y) || 1;
            const dist = typeof args[2] === 'number' ? args[2] : 50;
            for (let t = 0; t <= dist; t += 0.05) {
              const x = o.x + (d.x / len) * t;
              const y = o.y + (d.y / len) * t;
              const hit = world.objects.find((g) => g.alive && !GHOST.has(g.sprite) && g !== world.scriptObj && g.parent?.obj !== world.scriptObj && !g.bullet && Math.abs(x - g.x) <= g.w / 2 && Math.abs(y - g.y) <= g.h / 2);
              if (hit) return host('hit', { collider: hit, x, y, distance: t });
            }
            return host('hit', { collider: null, x: 0, y: 0, distance: 0 });
          }
          case 'Quaternion.Euler':
            return host('quat', vecOf(args[0])?.z ?? num(args[2]));
          case 'SceneManager.LoadScene':
            world.logs.push({ time: world.time, text: tr(`(Mini-Unity) LoadScene(${csText(args[0])}): the scene starts again. In Unity the scene from Build Settings opens.`, `(Мини-Unity) LoadScene(${csText(args[0])}): сцена начинается заново. В Unity откроется сцена из Build Settings.`) });
            world.reloadRequested = true;
            return undefined;
          case 'SceneManager.GetActiveScene':
            return host('scene', null);
          case 'Application.Quit':
            world.logs.push({ time: world.time, text: tr('Application.Quit(): works only in a built game.', 'Application.Quit(): работает только в собранной игре.') });
            return undefined;
          case 'PlayerPrefs.SetInt':
          case 'PlayerPrefs.SetFloat':
          case 'PlayerPrefs.SetString':
            world.prefs.set(csText(args[0]), args[1]);
            return undefined;
          case 'PlayerPrefs.GetInt':
          case 'PlayerPrefs.GetFloat':
          case 'PlayerPrefs.GetString':
            return world.prefs.has(csText(args[0])) ? world.prefs.get(csText(args[0]))! : (args[1] ?? (name === 'GetString' ? '' : 0));
          case 'PlayerPrefs.HasKey':
            return world.prefs.has(csText(args[0]));
          case 'PlayerPrefs.DeleteKey':
            world.prefs.delete(csText(args[0]));
            return undefined;
          case 'PlayerPrefs.DeleteAll':
            world.prefs.clear();
            return undefined;
          case 'PlayerPrefs.Save':
            return undefined;
          case 'Debug.DrawRay':
          case 'Debug.DrawLine': {
            const a0 = vecOf(args[0]);
            const a1 = vecOf(args[1]);
            if (a0 && a1) world.rays.push({ x1: a0.x, y1: a0.y, x2: name === 'DrawRay' ? a0.x + a1.x : a1.x, y2: name === 'DrawRay' ? a0.y + a1.y : a1.y, color: args[2] && typeof args[2] === 'object' && args[2].k === 'enum' ? args[2].name : 'white' });
            return undefined;
          }
        }
        return NOT_FOUND;
      },
      get(target: HostV, name: string, line: number): V | typeof NOT_FOUND {
        const o = target.ref as GameObj;
        switch (target.kind) {
          case 'transform':
            if (name === 'position' || name === 'localPosition') return v3(o.x, o.y);
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'localScale') return v3(o.sx ?? 1, o.sy ?? 1);
            if (name === 'rotation' || name === 'localRotation') return host('quat', o.rot ?? 0);
            if (name === 'eulerAngles' || name === 'localEulerAngles') return { k: 'vec', x: 0, y: 0, z: o.rot ?? 0, dim: 3 };
            if (name === 'right') {
              const r = world.rightOf(o);
              return v3(r.x, r.y);
            }
            if (name === 'up') {
              const a = ((o.rot ?? 0) * Math.PI) / 180;
              return v3(-Math.sin(a), Math.cos(a));
            }
            if (name === 'forward') return { k: 'vec', x: 0, y: 0, z: 1, dim: 3 };
            if (name === 'parent') return o.parent ? host('transform', o.parent.obj) : null;
            if (name === 'name') return o.name;
            if (name === 'tag') return o.tag;
            if (name === 'childCount') return world.objects.filter((c) => c.parent?.obj === o).length;
            break;
          case 'gameObject':
          case 'instance':
            if (name === 'transform') return host('transform', o);
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'name') return o.name;
            if (name === 'tag') return o.tag;
            if (name === 'activeSelf' || name === 'activeInHierarchy') return o.alive && !o.hidden;
            if (name === 'layer') return SOLID.has(o.sprite) ? 6 : 0;
            if (name === 'velocity' || name === 'linearVelocity') return { k: 'vec', x: o.vx, y: o.vy, z: 0, dim: 2 };
            break;
          case 'collider':
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'transform') return host('transform', o);
            if (name === 'tag') return o.tag;
            if (name === 'name') return o.name;
            if (name === 'attachedRigidbody') return o.rigidbody || o.bullet ? host('rigidbody', o) : null;
            break;
          case 'Time':
            if (name === 'deltaTime' || name === 'fixedDeltaTime' || name === 'smoothDeltaTime') return Math.fround(world.sdt);
            if (name === 'unscaledDeltaTime') return Math.fround(world.dt);
            if (name === 'time' || name === 'timeSinceLevelLoad') return Math.fround(world.time);
            if (name === 'timeScale') return world.timeScale;
            if (name === 'frameCount') return world.frameNo;
            break;
          case 'Input':
            if (name === 'mousePosition') return v3(world.mouse.x * PPU, world.mouse.y * PPU);
            if (name === 'anyKeyDown') return world.pressed.size > 0 || world.mousePressed.size > 0;
            if (name === 'anyKey') return world.keys.size > 0 || world.mouseDown.size > 0;
            break;
          case 'rigidbody':
            if (name === 'velocity' || name === 'linearVelocity') return { k: 'vec', x: o.vx, y: o.vy, z: 0, dim: 2 };
            if (name === 'gravityScale') return o.rigidbody?.gravityScale ?? 1;
            if (name === 'position') return { k: 'vec', x: o.x, y: o.y, z: 0, dim: 2 };
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'transform') return host('transform', o);
            if (name === 'mass') return 1;
            break;
          case 'sprite':
            if (name === 'enabled') return !o.hidden;
            if (name === 'flipX') return !!o.flipX;
            if (name === 'gameObject') return host('gameObject', o);
            break;
          case 'cc':
            if (name === 'isGrounded') return !!o.cc?.grounded;
            break;
          case 'hit': {
            const h = target.ref as { collider: GameObj | null; x: number; y: number; distance: number };
            if (name === 'collider' || name === 'transform') return h.collider ? host(name === 'collider' ? 'collider' : 'transform', h.collider) : null;
            if (name === 'point') return { k: 'vec', x: h.x, y: h.y, z: 0, dim: 2 };
            if (name === 'distance') return h.distance;
            break;
          }
          case 'quat':
            if (name === 'eulerAngles') return { k: 'vec', x: 0, y: 0, z: target.ref as number, dim: 3 };
            break;
          case 'scene':
            if (name === 'buildIndex') return 0;
            if (name === 'name') return 'Sandbox';
            break;
          case 'uitext':
            if (name === 'text') return (target.ref as { text: string }).text;
            break;
          case 'slider': {
            const u = target.ref as { slider: { value: number; max: number } };
            if (name === 'value') return u.slider.value;
            if (name === 'maxValue') return u.slider.max;
            break;
          }
          case 'camera':
            if (name === 'orthographicSize') return world.level.height / 2;
            if (name === 'transform') throw notInScene('Camera.main.transform', line);
            break;
          case 'layermask':
            if (name === 'value') return 64;
            break;
        }
        return NOT_FOUND;
      },
      set(target: HostV, name: string, value: V, line: number): boolean {
        const o = target.ref as GameObj;
        const vec = vecOf(value);
        if (target.kind === 'transform' && (name === 'position' || name === 'localPosition')) {
          if (!vec) throw new CsError(tr('transform.position needs a vector, for example new Vector3(1, 2, 0).', 'transform.position нужен вектор, например new Vector3(1, 2, 0).'), line);
          o.x = vec.x;
          o.y = vec.y;
          return true;
        }
        if (target.kind === 'transform' && (name === 'rotation' || name === 'localRotation')) {
          o.rot = angleOf(value);
          return true;
        }
        if (target.kind === 'transform' && (name === 'eulerAngles' || name === 'localEulerAngles') && vec) {
          o.rot = vec.z;
          return true;
        }
        if (target.kind === 'transform' && name === 'localScale' && vec) {
          o.sx = vec.x;
          o.sy = vec.y;
          return true;
        }
        if ((target.kind === 'rigidbody' || target.kind === 'instance' || target.kind === 'gameObject') && (name === 'velocity' || name === 'linearVelocity') && vec) {
          o.vx = vec.x;
          o.vy = vec.y;
          return true;
        }
        if (target.kind === 'rigidbody' && name === 'gravityScale' && typeof value === 'number' && o.rigidbody) {
          o.rigidbody.gravityScale = value;
          return true;
        }
        if (target.kind === 'rigidbody' && ['freezeRotation', 'mass', 'bodyType', 'drag', 'linearDamping', 'isKinematic'].includes(name)) return true;
        if ((target.kind === 'gameObject' || target.kind === 'instance') && name === 'tag' && typeof value === 'string') {
          o.tag = value;
          return true;
        }
        if ((target.kind === 'gameObject' || target.kind === 'instance') && name === 'name' && typeof value === 'string') {
          o.name = value;
          return true;
        }
        if (target.kind === 'Time' && name === 'timeScale' && typeof value === 'number') {
          world.timeScale = Math.max(0, value);
          return true;
        }
        if (target.kind === 'sprite' && name === 'enabled') {
          o.hidden = value === false;
          return true;
        }
        if (target.kind === 'sprite' && name === 'flipX') {
          o.flipX = value === true;
          return true;
        }
        if (target.kind === 'sprite' && name === 'color') return true;
        if (target.kind === 'uitext' && name === 'text') {
          (target.ref as { text: string }).text = csText(value);
          return true;
        }
        if (target.kind === 'slider' && (name === 'value' || name === 'maxValue') && typeof value === 'number') {
          const u = target.ref as { slider: { value: number; max: number } };
          if (name === 'value') u.slider.value = value;
          else u.slider.max = value;
          return true;
        }
        return false;
      },
      method(target: HostV, name: string, args: V[], line: number): V | typeof NOT_FOUND {
        const o = target.ref as GameObj;
        const plain = name.replace(/<.*$/, '');
        const gc = /^(?:GetComponent|GetComponentInChildren|GetComponentInParent)<(\w+)>$/.exec(name);
        if (gc && ['gameObject', 'collider', 'transform', 'instance', 'rigidbody'].includes(target.kind)) return world.componentOf(gc[1], o, line);
        switch (`${target.kind}.${plain}`) {
          case 'Input.GetKey':
            return world.keyDown(args[0]);
          case 'Input.GetKeyDown':
            return world.keyPressed(args[0]);
          case 'Input.GetKeyUp': {
            const nm = args[0] && typeof args[0] === 'object' && args[0].k === 'enum' ? args[0].name : csText(args[0]);
            return world.released.has(KEYMAP[nm] ?? nm.toLowerCase());
          }
          case 'Input.GetButton':
            return fireDown(csText(args[0]), world.keys, world.mouseDown);
          case 'Input.GetButtonDown':
            return fireDown(csText(args[0]), world.pressed, world.mousePressed);
          case 'Input.GetButtonUp':
            return fireDown(csText(args[0]), world.released, world.mouseReleased);
          case 'Input.GetMouseButton':
            return world.mouseDown.has(num(args[0]));
          case 'Input.GetMouseButtonDown':
            return world.mousePressed.has(num(args[0]));
          case 'Input.GetMouseButtonUp':
            return world.mouseReleased.has(num(args[0]));
          case 'Input.GetAxis':
          case 'Input.GetAxisRaw': {
            const axis = csText(args[0]);
            if (axis === 'Horizontal') return (world.keys.has('ArrowRight') || world.keys.has('d') ? 1 : 0) - (world.keys.has('ArrowLeft') || world.keys.has('a') ? 1 : 0);
            if (axis === 'Vertical') return (world.keys.has('ArrowUp') || world.keys.has('w') ? 1 : 0) - (world.keys.has('ArrowDown') || world.keys.has('s') ? 1 : 0);
            if (axis === 'Mouse X' || axis === 'Mouse Y' || axis === 'Mouse ScrollWheel') return 0;
            throw new CsError(tr(`Unknown input axis "${axis}". Use "Horizontal" or "Vertical".`, `Неизвестная ось ввода «${axis}». Используй "Horizontal" или "Vertical".`), line);
          }
          case 'transform.Translate': {
            const v = vecOf(args[0]);
            if (v) {
              o.x += v.x;
              o.y += v.y;
            } else {
              o.x += num(args[0]);
              o.y += num(args[1]);
            }
            return undefined;
          }
          case 'transform.Rotate': {
            const v = vecOf(args[0]);
            o.rot = ((o.rot ?? 0) + (v ? v.z : num(args[2]))) % 360;
            return undefined;
          }
          case 'transform.TransformDirection': {
            const v = vecOf(args[0]) ?? v3(num(args[0]), num(args[1]));
            const a = ((o.rot ?? 0) * Math.PI) / 180;
            return { k: 'vec', x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a), z: v.z, dim: 3 };
          }
          case 'transform.LookAt':
          case 'transform.SetParent':
          case 'transform.DetachChildren':
            return undefined;
          case 'transform.Find':
          case 'transform.GetChild':
            return world.objects.find((c) => c.parent?.obj === o) ? host('transform', world.objects.find((c) => c.parent?.obj === o)!) : null;
          case 'gameObject.CompareTag':
          case 'collider.CompareTag':
          case 'transform.CompareTag':
          case 'instance.CompareTag':
            return o.tag === csText(args[0]);
          case 'gameObject.SetActive':
          case 'instance.SetActive':
            if (o.sprite === 'none') o.hidden = args[0] !== true;
            else if (args[0] === false) o.alive = false;
            return undefined;
          case 'rigidbody.AddForce':
          case 'instance.AddForce': {
            const v = vecOf(args[0]);
            if (v) {
              const impulse = args[1] && typeof args[1] === 'object' && args[1].k === 'enum' && args[1].name === 'Impulse';
              o.vx += impulse ? v.x : v.x * world.sdt;
              o.vy += impulse ? v.y : v.y * world.sdt;
            }
            return undefined;
          }
          case 'rigidbody.MovePosition': {
            const v = vecOf(args[0]);
            if (v) {
              o.x = v.x;
              o.y = v.y;
            }
            return undefined;
          }
          case 'cc.Move': {
            const v = vecOf(args[0]);
            if (v) o.cc = { grounded: world.moveWithCollisions(o, v.x, v.y) };
            return undefined;
          }
          case 'cc.SimpleMove': {
            const v = vecOf(args[0]);
            if (v) o.cc = { grounded: world.moveWithCollisions(o, v.x * world.sdt, -9.81 * world.sdt) };
            return undefined;
          }
          case 'animator.SetFloat':
          case 'animator.SetBool':
          case 'animator.SetInteger':
            world.anim[csText(args[0])] = csText(args[1]);
            return undefined;
          case 'animator.SetTrigger':
            world.anim[csText(args[0])] = tr('triggered', 'сработал');
            world.logs.push({ time: world.time, text: `Animator: ${csText(args[0])} ▶` });
            return undefined;
          case 'animator.ResetTrigger':
            delete world.anim[csText(args[0])];
            return undefined;
          case 'animator.Play':
            world.anim.state = csText(args[0]);
            return undefined;
          case 'audio.PlayOneShot':
          case 'audio.Play':
            world.logs.push({ time: world.time, text: `🔊 ${args[0] && typeof args[0] === 'object' && args[0].k === 'host' ? String(args[0].ref) : tr('sound', 'звук')}` });
            return undefined;
          case 'audio.Stop':
          case 'audio.Pause':
            return undefined;
          case 'camera.ScreenToWorldPoint': {
            const v = vecOf(args[0]);
            return v3((v?.x ?? 0) / PPU, (v?.y ?? 0) / PPU);
          }
          case 'camera.WorldToScreenPoint': {
            const v = vecOf(args[0]);
            return v3((v?.x ?? 0) * PPU, (v?.y ?? 0) * PPU);
          }
          case 'layermask.value':
            return 64;
          case 'self.CompareTag':
            return world.scriptObj.tag === csText(args[0]);
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
