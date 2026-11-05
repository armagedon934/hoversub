// "Mini-Unity 3D": a small 3D world driven by real Unity-style C# scripts (run by the safe
// interpreter). It knows what a first-person shooter needs: a player with a CharacterController
// and a camera, mouse look, Physics.Raycast(…, out hit), quaternions, rigidbody boxes, bots with
// simple AI (patrol → see → chase → shoot), health and damage. Coordinates are Unity's (left-handed,
// Y up, Z forward). Drawing is done separately (Scene3D) — this file is pure logic and is tested.

import { tr, type Text2 } from '../i18n';
import { CsError, CsProgram, NOT_FOUND, csText, type Cell, type ClassInfo, type CoroutineRef, type HostV, type ObjV, type V, type VecV } from './csharp';
import { parseCSharp, syntaxProblems, type Problem } from './runner';

// ------------------------------------------------------------------------------------- maths

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
};
export const QI: Q = { x: 0, y: 0, z: 0, w: 1 };
const D2R = Math.PI / 180;

export function qMul(a: Q, b: Q): Q {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
const qAxis = (ax: V3, deg: number): Q => {
  const h = (deg * D2R) / 2;
  const s = Math.sin(h);
  return { x: ax.x * s, y: ax.y * s, z: ax.z * s, w: Math.cos(h) };
};
/** Unity's Quaternion.Euler: Z first, then X, then Y. */
export function qEuler(x: number, y: number, z: number): Q {
  return qMul(qMul(qAxis(v3(0, 1, 0), y), qAxis(v3(1, 0, 0), x)), qAxis(v3(0, 0, 1), z));
}
export function qRotate(q: Q, v: V3): V3 {
  const u = v3(q.x, q.y, q.z);
  const s = q.w;
  const dotUV = u.x * v.x + u.y * v.y + u.z * v.z;
  const dotUU = u.x * u.x + u.y * u.y + u.z * u.z;
  const cross = v3(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
  return add(add(mul(u, 2 * dotUV), mul(v, s * s - dotUU)), mul(cross, 2 * s));
}
/** Euler angles (degrees, 0…360) like Unity's eulerAngles. */
export function qToEuler(q: Q): V3 {
  const f = qRotate(q, v3(0, 0, 1));
  const up = qRotate(q, v3(0, 1, 0));
  const pitch = -Math.asin(Math.max(-1, Math.min(1, f.y))) / D2R;
  const yaw = Math.atan2(f.x, f.z) / D2R;
  // roll: angle between the actual up and the up of a yaw/pitch-only rotation
  const noRoll = qMul(qAxis(v3(0, 1, 0), yaw), qAxis(v3(1, 0, 0), pitch));
  const r = qRotate(noRoll, v3(1, 0, 0));
  const u0 = qRotate(noRoll, v3(0, 1, 0));
  const roll = Math.atan2(-(up.x * r.x + up.y * r.y + up.z * r.z), up.x * u0.x + up.y * u0.y + up.z * u0.z) / D2R;
  const wrap = (a: number) => ((a % 360) + 360) % 360;
  return v3(wrap(pitch), wrap(yaw), wrap(roll));
}
function qSlerp(a: Q, b: Q, t: number): Q {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bb = b;
  if (dot < 0) {
    bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
    dot = -dot;
  }
  if (dot > 0.9995) {
    const r = { x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t, z: a.z + (bb.z - a.z) * t, w: a.w + (bb.w - a.w) * t };
    const l = Math.hypot(r.x, r.y, r.z, r.w);
    return { x: r.x / l, y: r.y / l, z: r.z / l, w: r.w / l };
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return { x: a.x * wa + bb.x * wb, y: a.y * wa + bb.y * wb, z: a.z * wa + bb.z * wb, w: a.w * wa + bb.w * wb };
}
function qLook(forward: V3): Q {
  const f = norm(forward);
  const yaw = Math.atan2(f.x, f.z) / D2R;
  const pitch = -Math.asin(Math.max(-1, Math.min(1, f.y))) / D2R;
  return qEuler(pitch, yaw, 0);
}
const qInv = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

// ------------------------------------------------------------------------------------ world

export type Shape3 = 'box' | 'capsule' | 'sphere' | 'humanoid' | 'gun' | 'point' | 'none' | 'target' | 'light' | 'zone';

export interface Spec3 {
  name: string;
  tag?: string;
  shape: Shape3;
  pos: [number, number, number];
  /** Full size (box) or [radius, height, radius] (capsule). */
  size?: [number, number, number];
  rot?: [number, number, number];
  color?: string;
  solid?: boolean;
  trigger?: boolean;
  health?: number;
  rigidbody?: boolean;
  bot?: { team?: string; waypoints?: [number, number, number][]; speed?: number; accuracy?: number; fireRate?: number; damage?: number; sight?: number };
  emissive?: boolean;
  /** Armour: health comes back to full after this many seconds without a hit. */
  regen?: number;
  /** Armour plates: a hit weaker than this does nothing. */
  armor?: number;
}

export interface Obj3 {
  id: number;
  name: string;
  tag: string;
  shape: Shape3;
  pos: V3;
  rot: Q;
  scale: V3;
  /** Half extents of the collider. */
  half: V3;
  color: string;
  solid: boolean;
  trigger: boolean;
  alive: boolean;
  hidden: boolean;
  emissive: boolean;
  parent?: Obj3;
  /** Position and rotation relative to the parent. */
  local?: { pos: V3; rot: Q };
  vel: V3;
  rb?: { useGravity: boolean; grounded: boolean };
  cc?: { grounded: boolean; height: number; radius: number };
  health?: { value: number; max: number; deadAt?: number };
  bot?: Bot;
  /** Procedural body parts (humanoids): name → local rotation, driven by scripts or built-in walking. */
  bones?: Record<string, Obj3>;
  fov?: number;
  lastHitAt?: number;
  /** CharacterController.Move: where the object was at the start of this frame (for velocity). */
  moveFrom?: { frame: number; pos: V3 };
  regen?: number;
  armor?: number;
}

interface Bot {
  team: string;
  waypoints: V3[];
  wp: number;
  speed: number;
  accuracy: number;
  fireRate: number;
  damage: number;
  sight: number;
  nextShot: number;
  state: 'patrol' | 'chase' | 'attack' | 'dead';
  seenAt: number;
  walk: number;
  lastPos: V3;
  lastSeen?: V3;
  strafe: number;
}

export interface Shot3 {
  from: V3;
  to: V3;
  at: number;
  hit: boolean;
  byBot: boolean;
}

export interface ScriptSpec3 {
  source: string;
  /** Put the script on the object with this name (or every object with this tag when it starts with "#"). */
  on: string;
}

export interface Level3 {
  id: string;
  /** Background/sky colour and light: the first lessons are a calm, not-too-bright room. */
  sky?: string;
  fog?: number;
  floor?: { size: number; color: string };
  objects: Spec3[];
  player: { pos: [number, number, number]; yaw?: number; health?: number; gun?: boolean; visibleBody?: boolean };
  scripts?: ScriptSpec3[];
  /** Fill empty reference fields of the learner's scripts (camera, controller, gun tip…). */
  autoInspector?: boolean;
  /** Who thinks for the bots: the built-in AI (default) or the scripts on them. */
  botBrain?: 'builtin' | 'script';
  /** Who moves the arms and legs of the bots: the built-in walk (default) or the scripts. */
  botLegs?: 'builtin' | 'script';
}

export interface DemoStep3 {
  until: number;
  keys?: string[];
  mouse?: [number, number];
  buttons?: number[];
}

export interface Frame3 {
  status: 'playing' | 'error' | 'lost';
  message?: string;
  error?: Problem;
}

const host = (kind: string, ref: unknown): HostV => ({ k: 'host', kind, ref });
const vv = (a: V3): VecV => ({ k: 'vec', x: a.x, y: a.y, z: a.z, dim: 3 });
const asV3 = (v: V): V3 | null => (v && typeof v === 'object' && v.k === 'vec' ? v3(v.x, v.y, v.z) : null);
const quatOf = (v: V): Q | null => (v && typeof v === 'object' && v.k === 'host' && v.kind === 'quat3' ? (v.ref as Q) : null);

interface ScriptInst {
  program: CsProgram;
  cls: ClassInfo;
  obj: Obj3;
  self: ObjV | null;
}

interface Coroutine3 {
  inst: ScriptInst;
  gen: Generator<unknown, V, string | undefined>;
  until: number;
  frame: number;
  done: boolean;
}

export class World3D {
  objects: Obj3[] = [];
  player!: Obj3;
  /** The neck: a pivot between the body and the camera (lean, bob). */
  head!: Obj3;
  camera!: Obj3;
  gun?: Obj3;
  time = 0;
  dt = 1 / 60;
  timeScale = 1;
  frameNo = 0;
  keys = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  mouse = { dx: 0, dy: 0 };
  mouseDown = new Set<number>();
  mousePressed = new Set<number>();
  mouseReleased = new Set<number>();
  cursorLocked = false;
  logs: { time: number; text: string }[] = [];
  shots: Shot3[] = [];
  rays: { from: V3; to: V3; color: string }[] = [];
  ui: { name: string; text: string }[] = [];
  status: Frame3['status'] = 'playing';
  message = '';
  kills = 0;
  frameBudget = 60_000;
  insts: ScriptInst[] = [];
  private programs: { program: CsProgram; spec: ScriptSpec3 }[] = [];
  private coroutines: Coroutine3[] = [];
  private nextId = 1;
  private started = false;

  constructor(public level: Level3) {
    this.reset();
  }

  get sdt(): number {
    return this.dt * this.timeScale;
  }

  reset(): void {
    this.objects = [];
    this.nextId = 1;
    const L = this.level;
    this.player = this.add({ name: 'Player', tag: 'Player', shape: L.player.visibleBody ? 'humanoid' : 'capsule', pos: L.player.pos, size: [0.6, 1.8, 0.6] });
    this.player.cc = { grounded: false, height: 1.8, radius: 0.3 };
    this.player.solid = true;
    this.player.health = { value: L.player.health ?? 100, max: L.player.health ?? 100 };
    this.player.hidden = !L.player.visibleBody;
    this.player.rot = qEuler(0, L.player.yaw ?? 0, 0);
    this.head = this.add({ name: 'Head', shape: 'none', pos: [0, 0, 0] });
    this.head.parent = this.player;
    this.head.local = { pos: v3(0, 0.7, 0), rot: QI };
    this.camera = this.add({ name: 'Main Camera', tag: 'MainCamera', shape: 'none', pos: [0, 0, 0] });
    this.camera.parent = this.head;
    this.camera.local = { pos: v3(), rot: QI };
    this.camera.fov = 70;
    if (L.player.gun) {
      this.gun = this.add({ name: 'Gun', tag: 'Untagged', shape: 'gun', pos: [0, 0, 0] });
      this.gun.parent = this.camera;
      this.gun.local = { pos: v3(0.25, -0.22, 0.45), rot: QI };
      const tip = this.add({ name: 'GunTip', tag: 'Untagged', shape: 'point', pos: [0, 0, 0] });
      tip.parent = this.gun;
      tip.local = { pos: v3(0, 0.03, 0.35), rot: QI };
    }
    for (const s of L.objects) this.add(s);
    this.time = 0;
    this.frameNo = 0;
    this.logs = [];
    this.shots = [];
    this.rays = [];
    this.ui = [];
    this.kills = 0;
    this.lastRay = null;
    this.status = 'playing';
    this.message = '';
    this.started = false;
    this.insts = [];
    this.coroutines = [];
    this.timeScale = 1;
    this.cursorLocked = false;
    this.keys.clear();
    this.pressed.clear();
    this.mouseDown.clear();
    this.follow();
  }

  add(s: Spec3): Obj3 {
    const size = s.size ?? (s.shape === 'humanoid' ? [0.5, 1.8, 0.35] : s.shape === 'target' ? [0.8, 0.8, 0.1] : [1, 1, 1]);
    const o: Obj3 = {
      id: this.nextId++,
      name: s.name,
      tag: s.tag ?? 'Untagged',
      shape: s.shape,
      pos: v3(...s.pos),
      rot: s.rot ? qEuler(...s.rot) : QI,
      scale: v3(1, 1, 1),
      half: v3(size[0] / 2, size[1] / 2, size[2] / 2),
      color: s.color ?? '#9aa3ad',
      solid: s.solid ?? (s.shape === 'box' || (s.shape === 'humanoid' && !!s.bot)),
      trigger: s.trigger ?? s.shape === 'zone',
      alive: true,
      hidden: s.shape === 'point' || s.shape === 'none' || s.shape === 'light',
      emissive: !!s.emissive,
      vel: v3(),
    };
    if (s.rigidbody) o.rb = { useGravity: true, grounded: false };
    if (s.health) o.health = { value: s.health, max: s.health };
    if (s.regen) o.regen = s.regen;
    if (s.armor) o.armor = s.armor;
    if (s.bot) {
      o.health ??= { value: 100, max: 100 };
      o.bot = {
        team: s.bot.team ?? 'red',
        waypoints: (s.bot.waypoints ?? [s.pos]).map((p) => v3(...p)),
        wp: 0,
        speed: s.bot.speed ?? 2.2,
        accuracy: s.bot.accuracy ?? 0.25,
        fireRate: s.bot.fireRate ?? 1.2,
        damage: s.bot.damage ?? 8,
        sight: s.bot.sight ?? 18,
        nextShot: 0,
        state: 'patrol',
        seenAt: -10,
        walk: 0,
        lastPos: v3(...s.pos),
        strafe: 1,
      };
    }
    this.objects.push(o);
    if (s.shape === 'humanoid') o.bones = this.makeBones(o);
    return o;
  }

  /** A simple humanoid made of boxes: hips, spine, head, arms, legs (rotatable joints). */
  private makeBones(o: Obj3): Record<string, Obj3> {
    const b: Record<string, Obj3> = {};
    const part = (name: string, parent: Obj3, pos: [number, number, number], size: [number, number, number], color: string) => {
      const p = this.add({ name, shape: 'box', pos: [0, 0, 0], size, color, solid: false });
      p.parent = parent;
      p.local = { pos: v3(...pos), rot: QI };
      b[name] = p;
      return p;
    };
    const skin = '#d9b38c';
    const body = o.tag === 'Player' || o.bot?.team === 'blue' ? '#3b6db5' : '#b5503b';
    const hips = part('Hips', o, [0, 0.05, 0], [0.34, 0.2, 0.22], '#2d3436');
    const spine = part('Spine', hips, [0, 0.38, 0], [0.4, 0.55, 0.24], body);
    part('Head', spine, [0, 0.45, 0], [0.24, 0.26, 0.24], skin);
    const la = part('LeftArm', spine, [-0.27, 0.2, 0], [0.12, 0.55, 0.12], body);
    la.local!.pos = v3(-0.27, 0.0, 0);
    const ra = part('RightArm', spine, [0.27, 0.0, 0], [0.12, 0.55, 0.12], body);
    void ra;
    part('LeftLeg', hips, [-0.1, -0.45, 0], [0.15, 0.7, 0.15], '#2d3436');
    part('RightLeg', hips, [0.1, -0.45, 0], [0.15, 0.7, 0.15], '#2d3436');
    return b;
  }

  /** World position/rotation of children follow their parents. */
  follow(): void {
    for (const o of this.objects) {
      if (!o.parent || !o.local) continue;
      const chain: Obj3[] = [];
      let p: Obj3 | undefined = o;
      while (p) {
        chain.unshift(p);
        p = p.parent;
      }
      let pos = chain[0].pos;
      let rot = chain[0].rot;
      for (let k = 1; k < chain.length; k++) {
        const c = chain[k];
        if (!c.local) continue;
        pos = add(pos, qRotate(rot, c.local.pos));
        rot = qMul(rot, c.local.rot);
      }
      o.pos = pos;
      o.rot = rot;
      if (o.parent && !o.parent.alive) o.alive = false;
    }
  }

  // -------------------------------------------------------------------------------- scripts

  /** Compiles the learner's script and the level's helper scripts. Returns problems or null. */
  async load(source: string, attachTo = 'Player'): Promise<Problem[] | null> {
    this.reset();
    this.programs = [];
    const all: ScriptSpec3[] = [{ source, on: attachTo }, ...(this.level.scripts ?? [])];
    for (const spec of all) {
      const tree = await parseCSharp(spec.source);
      const problems = syntaxProblems(tree, spec.source);
      if (problems.length) return spec === all[0] ? problems : [{ ...problems[0], message: `(level script) ${problems[0].message}` }];
      const program = new CsProgram(tree, spec.source, { maxSteps: 1_000_000_000, maxDepth: 150, maxTrace: 0, maxOutput: 500 });
      const cls = [...program.classes.values()].find((c) => c.base === 'MonoBehaviour');
      if (!cls) return [{ line: 0, col: 0, message: tr('No Unity script found: write a class that inherits MonoBehaviour.', 'Не найден скрипт Unity: нужен класс, который наследует MonoBehaviour.') }];
      program.host = this.makeHost(program);
      this.programs.push({ program, spec });
    }
    return null;
  }

  private targetsOf(on: string): Obj3[] {
    if (on.startsWith('#')) return this.objects.filter((o) => o.tag === on.slice(1));
    const o = this.objects.find((x) => x.name === on);
    return o ? [o] : [this.player];
  }

  private drain(gen: Generator<unknown, V, string | undefined>): V {
    let n = 0;
    for (;;) {
      const r = gen.next();
      if (r.done) return r.value;
      const ev = r.value as { t: string };
      if (ev.t === 'wait') throw new CsError(tr('"yield return" only works inside a coroutine started with StartCoroutine(…).', '«yield return» работает только внутри корутины, запущенной через StartCoroutine(…).'), 0, 'runtime');
      if (ev.t === 'input') throw new CsError(tr('Console.ReadLine does not work in a game.', 'Console.ReadLine в игре не работает.'), 0, 'unsupported');
      if (++n > this.frameBudget)
        throw new CsError(tr('One frame took too long: probably an endless loop inside Update. In Unity the whole game would freeze.', 'Один кадр выполнялся слишком долго: скорее всего, бесконечный цикл в Update. В Unity зависла бы вся игра.'), 0, 'limit');
    }
  }

  private call(inst: ScriptInst, method: string, args: V[] = []): void {
    const m = inst.cls.methods.get(method);
    if (!m) return;
    inst.program.activate();
    const r = this.drain(inst.program.invokeMethod(m[0], inst.cls, inst.self, args, m[0].startPosition.row) as Generator<unknown, V, string | undefined>);
    if (r && typeof r === 'object' && r.k === 'host' && r.kind === 'coroutine') this.startCoroutine(inst, r, m[0].startPosition.row);
  }

  private callAll(method: string): void {
    for (const inst of [...this.insts]) if (inst.obj.alive || inst.obj === this.player) this.call(inst, method);
  }

  private startCoroutine(inst: ScriptInst, v: V, line: number): V {
    let ref: CoroutineRef | null = null;
    if (v && typeof v === 'object' && v.k === 'host' && v.kind === 'coroutine') ref = v.ref as CoroutineRef;
    else if (typeof v === 'string') {
      const m = inst.cls.methods.get(v);
      if (m) ref = { method: m[0], cls: inst.cls, self: inst.self, args: [], line };
    }
    if (!ref) throw new CsError(tr('StartCoroutine needs a method that returns IEnumerator.', 'StartCoroutine нужен метод, который возвращает IEnumerator.'), line);
    inst.program.activate();
    const co: Coroutine3 = { inst, gen: inst.program.invokeMethod(ref.method, ref.cls, ref.self, ref.args, ref.line, true) as Generator<unknown, V, string | undefined>, until: this.time, frame: this.frameNo, done: false };
    this.coroutines.push(co);
    this.stepCoroutine(co);
    return host('coroutineHandle', co);
  }

  private stepCoroutine(co: Coroutine3): void {
    co.frame = this.frameNo;
    co.inst.program.activate();
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
      if (++n > this.frameBudget) throw new CsError(tr('A coroutine ran too long without "yield return" — probably an endless loop.', 'Корутина слишком долго работала без «yield return» — скорее всего, бесконечный цикл.'), 0, 'limit');
    }
  }

  // ---------------------------------------------------------------------------------- frame

  frame(): Frame3 {
    if (this.status !== 'playing') return { status: this.status, message: this.message };
    try {
      if (!this.started) {
        this.started = true;
        for (const { program, spec } of this.programs) {
          program.activate();
          const init = program.initStatics();
          for (;;) if (init.next().done) break;
          const cls = [...program.classes.values()].find((c) => c.base === 'MonoBehaviour')!;
          for (const obj of this.targetsOf(spec.on)) {
            const inst: ScriptInst = { program, cls, obj, self: null };
            inst.self = this.drain(program.instantiate(cls, [], 0, obj as never) as Generator<unknown, V, string | undefined>) as ObjV;
            this.insts.push(inst);
          }
        }
        if (this.level.autoInspector) for (const inst of this.insts) this.autoInspector(inst);
        this.callAll('Awake');
        this.callAll('OnEnable');
        this.callAll('Start');
      }
      this.frameNo++;
      this.rays = [];
      this.follow();
      this.callAll('FixedUpdate');
      this.physics();
      this.callAll('Update');
      this.runCoroutines();
      this.follow();
      this.bots();
      for (const o of this.objects)
        if (o.regen && o.alive && o.health && o.health.value > 0 && o.health.value < o.health.max && this.time - (o.lastHitAt ?? 0) > o.regen) o.health.value = o.health.max;
      this.callAll('LateUpdate');
      this.follow();
      this.triggers();
      this.time += this.sdt;
      this.pressed.clear();
      this.released.clear();
      this.mousePressed.clear();
      this.mouseReleased.clear();
      this.mouse = { dx: 0, dy: 0 };
      this.shots = this.shots.filter((s) => this.time - s.at < 0.25);
      if (this.player.health && this.player.health.value <= 0 && this.status === 'playing') {
        this.status = 'lost';
        this.message = tr('You were defeated. Try again!', 'Тебя победили. Попробуй ещё раз!');
      }
    } catch (e) {
      this.status = 'error';
      const err = e instanceof CsError ? e : new CsError(String(e instanceof Error ? e.message : e), 0);
      this.message = err.message;
      return { status: 'error', message: err.message, error: { line: err.line, col: 0, message: err.message, code: err.exception } };
    }
    return { status: this.status, message: this.message };
  }

  private runCoroutines(): void {
    for (const co of [...this.coroutines]) if (!co.done && co.frame !== this.frameNo && co.until <= this.time + 1e-9) this.stepCoroutine(co);
    this.coroutines = this.coroutines.filter((c) => !c.done);
  }

  private prevKeys = new Set<string>();
  private prevButtons = new Set<number>();

  /** One frame with the given input held (keys, mouse movement, buttons). Presses are detected between calls. */
  step(input: DemoStep3): Frame3 {
    const now = new Set(input.keys ?? []);
    const nb = new Set(input.buttons ?? []);
    this.keys = now;
    this.pressed = new Set([...now].filter((k) => !this.prevKeys.has(k)));
    this.released = new Set([...this.prevKeys].filter((k) => !now.has(k)));
    this.mouseDown = nb;
    this.mousePressed = new Set([...nb].filter((b) => !this.prevButtons.has(b)));
    this.mouseReleased = new Set([...this.prevButtons].filter((b) => !nb.has(b)));
    this.prevKeys = now;
    this.prevButtons = nb;
    this.mouse = { dx: input.mouse?.[0] ?? 0, dy: input.mouse?.[1] ?? 0 };
    return this.frame();
  }

  /** Simulates without drawing (tests): demo steps hold keys, move the mouse and press buttons. */
  simulate(seconds: number, demo: DemoStep3[] | ((t: number, w: World3D) => DemoStep3), stop?: (w: World3D) => boolean): Frame3 {
    let r: Frame3 = { status: 'playing' };
    for (let t = 0; t < seconds && r.status === 'playing'; t += this.dt) {
      if (stop?.(this)) break;
      const step = typeof demo === 'function' ? demo(t, this) : (demo.find((d) => t < d.until) ?? demo[demo.length - 1] ?? { until: 0 });
      r = this.step(step);
    }
    return r;
  }

  // -------------------------------------------------------------------------------- physics

  /** True when o is the root itself or hangs under it (child, grandchild…). */
  isPartOf(o: Obj3, root: Obj3): boolean {
    for (let p: Obj3 | undefined = o; p; p = p.parent) if (p === root) return true;
    return false;
  }

  private aabb(o: Obj3): { min: V3; max: V3 } {
    return { min: sub(o.pos, o.half), max: add(o.pos, o.half) };
  }

  overlapsPublic(a: Obj3, b: Obj3): boolean {
    return this.overlaps(a, b);
  }

  private overlaps(a: Obj3, b: Obj3): boolean {
    return Math.abs(a.pos.x - b.pos.x) < a.half.x + b.half.x && Math.abs(a.pos.y - b.pos.y) < a.half.y + b.half.y && Math.abs(a.pos.z - b.pos.z) < a.half.z + b.half.z;
  }

  solids(except: Obj3): Obj3[] {
    return this.objects.filter((o) => o.alive && o.solid && o !== except && o.parent !== except && !(o.parent && o.parent.parent === except));
  }

  private floorY(): number {
    return 0;
  }

  /** Is something solid right under the object (the floor or a box top within 3 cm)? */
  supported(o: Obj3): boolean {
    const bottom = o.pos.y - o.half.y;
    if (bottom <= this.floorY() + 0.03) return true;
    return this.solids(o).some(
      (s) => Math.abs(s.pos.x - o.pos.x) < s.half.x + o.half.x && Math.abs(s.pos.z - o.pos.z) < s.half.z + o.half.z && Math.abs(s.pos.y + s.half.y - bottom) < 0.03,
    );
  }

  /** Moves with collisions axis by axis (like CharacterController.Move). Returns true when it landed. */
  moveCollide(o: Obj3, d: V3): boolean {
    let grounded = false;
    const solids = this.solids(o);
    for (const axis of ['x', 'z', 'y'] as const) {
      if (!d[axis]) continue;
      o.pos[axis] += d[axis];
      for (const s of solids) {
        if (!this.overlaps(o, s)) continue;
        // a low step (< 0.35) is climbed instead of blocking, like Unity's step offset
        if (axis !== 'y' && s.pos.y + s.half.y - (o.pos.y - o.half.y) < 0.35 && s.pos.y + s.half.y - (o.pos.y - o.half.y) > 0) {
          o.pos.y = s.pos.y + s.half.y + o.half.y + 0.001;
          continue;
        }
        if (d[axis] > 0) o.pos[axis] = s.pos[axis] - s.half[axis] - o.half[axis] - 0.0001;
        else {
          o.pos[axis] = s.pos[axis] + s.half[axis] + o.half[axis] + 0.0001;
          if (axis === 'y') grounded = true;
        }
      }
      if (axis === 'y' && o.pos.y - o.half.y < this.floorY()) {
        o.pos.y = this.floorY() + o.half.y;
        if (d.y < 0) grounded = true;
      }
    }
    return grounded;
  }

  private physics(): void {
    for (const o of this.objects) {
      if (!o.alive || !o.rb) continue;
      if (o.rb.useGravity) o.vel.y -= 9.81 * this.sdt;
      o.rb.grounded = this.moveCollide(o, mul(o.vel, this.sdt));
      if (o.rb.grounded) {
        if (o.vel.y < 0) o.vel.y = 0;
        o.vel.x *= 0.9;
        o.vel.z *= 0.9;
      }
    }
  }

  // ---------------------------------------------------------------------------------- raycast

  /** Ray against boxes (slab test). Ignores the given objects (the shooter and its children). */
  raycast(origin: V3, dir: V3, maxDist: number, ignore: Obj3[] = []): { obj: Obj3; point: V3; normal: V3; distance: number } | null {
    const d = norm(dir);
    let best: { obj: Obj3; point: V3; normal: V3; distance: number } | null = null;
    const skip = new Set(ignore);
    for (const o of this.objects) {
      if (!o.alive || o.shape === 'point' || o.shape === 'none' || o.shape === 'light' || o.shape === 'zone' || o.shape === 'gun' || skip.has(o) || (o.parent && skip.has(o.parent))) continue;
      // body parts are drawn, but the ray hits the whole body (its box)
      if (o.parent && (o.parent.bones || o.parent.parent?.bones || o.parent.parent?.parent?.bones)) continue;
      const { min, max } = this.aabb(o);
      // like Unity: a ray that starts inside a collider does not hit that collider (the shooter itself)
      if (origin.x > min.x && origin.x < max.x && origin.y > min.y && origin.y < max.y && origin.z > min.z && origin.z < max.z) continue;
      let tmin = 0;
      let tmax = maxDist;
      let n = v3();
      let ok = true;
      for (const k of ['x', 'y', 'z'] as const) {
        if (Math.abs(d[k]) < 1e-9) {
          if (origin[k] < min[k] || origin[k] > max[k]) ok = false;
          continue;
        }
        let t1 = (min[k] - origin[k]) / d[k];
        let t2 = (max[k] - origin[k]) / d[k];
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tmin) {
          tmin = t1;
          n = v3();
          n[k] = d[k] > 0 ? -1 : 1;
        }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) ok = false;
      }
      if (!ok || tmin > maxDist) continue;
      if (!best || tmin < best.distance) best = { obj: o, point: add(origin, mul(d, tmin)), normal: n, distance: tmin };
    }
    // the floor
    if (d.y < 0) {
      const t = (this.floorY() - origin.y) / d.y;
      if (t >= 0 && t <= maxDist && (!best || t < best.distance)) best = { obj: this.floorObj(), point: add(origin, mul(d, t)), normal: v3(0, 1, 0), distance: t };
    }
    return best;
  }

  private floorCache?: Obj3;
  private floorObj(): Obj3 {
    this.floorCache ??= { id: 0, name: 'Ground', tag: 'Ground', shape: 'box', pos: v3(), rot: QI, scale: v3(1, 1, 1), half: v3(100, 0.01, 100), color: '#777', solid: true, trigger: false, alive: true, hidden: true, emissive: false, vel: v3() };
    return this.floorCache;
  }

  /** The last ray from Physics.Raycast this frame: damage right after it can be a headshot. */
  lastRay: { obj: Obj3; point: V3; frame: number } | null = null;

  teamOf(o: Obj3): string | undefined {
    return o === this.player ? 'blue' : o.bot?.team;
  }

  /** Bots of the enemy team (red) that are still in the fight. */
  redLeft(): number {
    return this.objects.filter((o) => o.bot && o.alive && o.bot.team !== 'blue' && o.bot.state !== 'dead').length;
  }

  damage(o: Obj3, amount: number, by: Obj3 | null = this.player): void {
    if (!o.health || o.health.value <= 0) return;
    if (by && by !== o && this.teamOf(by) && this.teamOf(by) === this.teamOf(o)) {
      if (by === this.player && !this.logs.some((l) => l.time > this.time - 2 && /👥/.test(l.text))) this.logs.push({ time: this.time, text: tr('👥 Friendly — do not shoot your own!', '👥 Это свой — не стреляй по своим!') });
      return;
    }
    if (by === this.player && o.bones && this.lastRay?.obj === o && this.lastRay.frame === this.frameNo && this.lastRay.point.y > o.pos.y + o.half.y - 0.34) {
      amount *= 2;
      this.logs.push({ time: this.time, text: tr('🎯 Headshot! Double damage', '🎯 В голову! Двойной урон') });
    }
    if (o.armor && amount < o.armor) {
      o.lastHitAt = this.time;
      if (by === this.player && !this.logs.some((l) => l.time > this.time - 1 && /🛡/u.test(l.text))) this.logs.push({ time: this.time, text: tr(`🛡 The armour holds: ${amount} is less than ${o.armor}`, `🛡 Броня держит: ${amount} меньше ${o.armor}`) });
      return;
    }
    o.health.value = Math.max(0, o.health.value - amount);
    o.lastHitAt = this.time;
    if (o.health.value <= 0) {
      o.health.deadAt = this.time;
      if (o.bot) {
        o.bot.state = 'dead';
        o.solid = false;
        o.tag = 'Dead';
        if (by === this.player) this.kills++;
        this.logs.push({ time: this.time, text: tr(`☠ ${o.name} is down`, `☠ ${o.name} выведен из боя`) });
      } else if (o.shape === 'target' || o.tag === 'Target') {
        o.alive = false;
        if (by === this.player) this.kills++;
      }
    }
  }

  // ------------------------------------------------------------------------------------- bots

  private canSee(b: Obj3, target: Obj3): boolean {
    const eye = add(b.pos, v3(0, 0.7, 0));
    const to = sub(add(target.pos, v3(0, target === this.player ? 0.6 : 0.5, 0)), eye);
    const dist = len(to);
    if (dist > (b.bot?.sight ?? 18)) return false;
    const fwd = qRotate(b.rot, v3(0, 0, 1));
    const cos = (fwd.x * to.x + fwd.z * to.z) / ((Math.hypot(fwd.x, fwd.z) * Math.hypot(to.x, to.z)) || 1);
    // outside the field of view (70° each side) — unless it just saw the target or was just shot
    if (cos < Math.cos(70 * D2R) && this.time - (b.bot?.seenAt ?? -10) > 2 && this.time - (b.lastHitAt ?? -10) > 1) return false;
    const hit = this.raycast(eye, to, dist, [b]);
    return !!hit && this.isPartOf(hit.obj, target);
  }

  private foesOf(o: Obj3): Obj3[] {
    const team = o.bot!.team;
    const out: Obj3[] = [];
    if (team !== 'blue' && this.player.alive && (this.player.health?.value ?? 1) > 0) out.push(this.player);
    for (const x of this.objects) if (x.bot && x !== o && x.alive && x.bot.state !== 'dead' && x.bot.team !== team) out.push(x);
    return out;
  }

  private bots(): void {
    const brain = this.level.botBrain ?? 'builtin';
    const legs = this.level.botLegs ?? 'builtin';
    for (const o of this.objects) {
      const b = o.bot;
      if (!b || !o.alive) continue;
      if (b.state === 'dead') {
        // fall over, then disappear after a while
        const t = Math.min(1, (this.time - (o.health?.deadAt ?? this.time)) * 2.5);
        o.rot = qMul(qEuler(0, qToEuler(o.rot).y, 0), qEuler(-88 * t, 0, 0));
        if (o.bones?.Spine?.local) o.bones.Spine.local.rot = qEuler(-20 * t, 0, 0);
        if (this.time - (o.health?.deadAt ?? 0) > 6) o.alive = false;
        continue;
      }
      if (brain === 'builtin') this.think(o, b);
      const moved = Math.hypot(o.pos.x - b.lastPos.x, o.pos.z - b.lastPos.z) / Math.max(1e-6, this.sdt);
      b.lastPos = { ...o.pos };
      if (legs === 'builtin') {
        this.animateWalk(o, moved);
        // a short flinch when hit
        const k = (this.time - (o.lastHitAt ?? -10)) / 0.3;
        if (o.bones?.Spine?.local) o.bones.Spine.local.rot = k < 1 ? qEuler(-18 * (1 - k), 8 * (1 - k), 0) : QI;
      }
    }
  }

  /** The built-in bot brain: patrol → sees a foe → attack (strafing, shooting) → chase where it was seen. */
  private think(o: Obj3, b: Bot): void {
    let target: Obj3 | null = null;
    let best = Infinity;
    for (const f of this.foesOf(o)) {
      const d = len(sub(f.pos, o.pos));
      if (d < best && this.canSee(o, f)) {
        best = d;
        target = f;
      }
    }
    if (target) {
      if (b.state !== 'attack') b.nextShot = Math.max(b.nextShot, this.time + 0.45 + 0.4 * this.rand()); // reaction time
      b.seenAt = this.time;
      b.lastSeen = { ...target.pos };
    }
    const remembers = this.time - b.seenAt < 4 && !!b.lastSeen;
    b.state = target ? 'attack' : remembers ? 'chase' : 'patrol';
    let goal: V3 | null = null;
    if (b.state === 'patrol' && b.waypoints.length) {
      goal = b.waypoints[b.wp % b.waypoints.length];
      if (Math.hypot(goal.x - o.pos.x, goal.z - o.pos.z) < 0.4) b.wp = (b.wp + 1) % b.waypoints.length;
    } else if (b.state === 'attack' && target) goal = target.pos;
    else if (b.state === 'chase') goal = b.lastSeen!;
    if (goal) {
      const to = v3(goal.x - o.pos.x, 0, goal.z - o.pos.z);
      const dist = Math.hypot(to.x, to.z);
      if (dist > 0.05) o.rot = qSlerp(o.rot, qLook(to), Math.min(1, 6 * this.sdt));
      if (b.state === 'attack') {
        // keep some distance and side-step, like a person in a firefight
        if (Math.floor(this.time / 1.4) % 2 === 0) b.strafe = b.strafe || 1;
        else if (b.strafe === 1 && this.rand() < 0.02) b.strafe = -1;
        const side = mul(norm(v3(to.z, 0, -to.x)), b.strafe * b.speed * 0.45 * this.sdt);
        const approach = dist > 7 ? mul(norm(to), b.speed * 0.7 * this.sdt) : v3();
        const before = { ...o.pos };
        this.moveCollide(o, add(side, approach));
        if (Math.hypot(o.pos.x - before.x, o.pos.z - before.z) < 1e-4) b.strafe = -b.strafe;
      } else if (dist > 0.1) {
        const step = mul(norm(to), (b.state === 'patrol' ? b.speed * 0.6 : b.speed) * this.sdt);
        const before = { ...o.pos };
        this.moveCollide(o, step);
        // walked into a box? side-step around it
        if (Math.hypot(o.pos.x - before.x, o.pos.z - before.z) < len(step) * 0.3) this.moveCollide(o, mul(v3(step.z, 0, -step.x), b.strafe * 1.5));
        if (b.state === 'chase' && dist < 0.5) b.seenAt = -10;
      }
    }
    o.vel = v3(0, 0, 0);
    if (b.state === 'attack' && target && this.time >= b.nextShot) {
      b.nextShot = this.time + b.fireRate * (0.7 + 0.6 * this.rand());
      const eye = add(o.pos, v3(0, 0.7, 0));
      const aim = sub(add(target.pos, v3(0, target === this.player ? 0.5 : 0.4, 0)), eye);
      const spread = b.accuracy * (1 + len(aim) / 20);
      const dir = norm(add(norm(aim), v3((this.rand() - 0.5) * spread, (this.rand() - 0.5) * spread, (this.rand() - 0.5) * spread)));
      const hit = this.raycast(eye, dir, 60, [o]);
      const end = hit ? hit.point : add(eye, mul(dir, 60));
      const struck = hit ? this.objects.find((x) => x.health && this.isPartOf(hit.obj, x) && (x === this.player || x.bot)) : undefined;
      this.shots.push({ from: eye, to: end, at: this.time, hit: !!struck, byBot: true });
      if (struck) this.damage(struck, b.damage, o);
    }
  }

  /** Built-in procedural walk: legs and arms swing with the speed (scripts can override bones). */
  private animateWalk(o: Obj3, speed: number): void {
    if (!o.bones || !o.bot) return;
    o.bot.walk += speed * this.sdt * 3.2;
    const swing = Math.min(1, speed / 3) * 32;
    const s = Math.sin(o.bot.walk) * swing;
    const set = (n: string, x: number) => {
      const bone = o.bones![n];
      if (bone?.local) bone.local.rot = qEuler(x, 0, 0);
    };
    set('LeftLeg', s);
    set('RightLeg', -s);
    set('LeftArm', o.bot.state === 'attack' ? -70 : -s * 0.8);
    set('RightArm', o.bot.state === 'attack' ? -85 : s * 0.8);
    // a little bounce of the hips at every step
    const hips = o.bones.Hips;
    if (hips?.local) hips.local.pos = v3(0, 0.05 + Math.abs(Math.sin(o.bot.walk)) * 0.04 * Math.min(1, speed / 3), 0);
  }

  private seed = 12345;
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // ---------------------------------------------------------------------------------- triggers

  private touching = new Set<string>();

  private triggers(): void {
    const now = new Set<string>();
    for (const inst of this.insts) {
      const me = inst.obj;
      if (!inst.cls.methods.has('OnTriggerEnter') && !inst.cls.methods.has('OnTriggerExit')) continue;
      for (const o of this.objects) {
        if (o === me || !o.alive || !o.trigger) continue;
        if (!this.overlaps(me, o)) continue;
        const key = `${inst.obj.id}:${o.id}`;
        now.add(key);
        if (!this.touching.has(key)) this.call(inst, 'OnTriggerEnter', [host('collider', o)]);
      }
      for (const key of this.touching) {
        if (now.has(key) || !key.startsWith(`${me.id}:`)) continue;
        const o = this.objects.find((x) => x.id === Number(key.split(':')[1]));
        if (o) this.call(inst, 'OnTriggerExit', [host('collider', o)]);
      }
    }
    this.touching = now;
  }

  // -------------------------------------------------------------------------- auto inspector

  private autoInspector(inst: ScriptInst): void {
    const note = (field: string, what: string) => this.logs.push({ time: 0, text: `Inspector: ${field} ← ${what}` });
    for (const [name, cell] of inst.self!.fields) {
      if (cell.v !== null && cell.v !== undefined) continue;
      const t = cell.type.replace(/^UnityEngine\./, '');
      if (t === 'Transform' && /head|neck|pivot/i.test(name)) {
        cell.v = host('transform', this.head);
        note(name, tr('the head (neck pivot)', 'голова (шарнир шеи)'));
      } else if (t === 'Transform' && /cam|view|look|eye/i.test(name)) {
        cell.v = host('transform', this.camera);
        note(name, tr('the camera', 'камера'));
      } else if (t === 'Transform' && /gun|weapon|muzzle|tip/i.test(name) && this.gun) {
        const target = /tip|muzzle/i.test(name) ? (this.objects.find((o) => o.name === 'GunTip') ?? this.gun) : this.gun;
        cell.v = host('transform', target);
        note(name, target.name);
      } else if (t === 'Transform' && /player|target/i.test(name)) {
        cell.v = host('transform', this.player);
        note(name, tr('the player', 'игрок'));
      } else if (t === 'Health' && /player|me|my|own/i.test(name)) {
        cell.v = host('health', this.player);
        note(name, tr('the player\'s Health', 'Health игрока'));
      } else if (t === 'Camera') {
        cell.v = host('camera', this.camera);
        note(name, tr('the camera', 'камера'));
      } else if (t === 'CharacterController') {
        cell.v = host('cc', inst.obj);
        note(name, 'CharacterController');
      } else if (/^(TMP_Text|Text|TextMeshProUGUI)$/.test(t)) {
        const u = { name, text: '' };
        this.ui.push(u);
        cell.v = host('uitext', u);
        note(name, tr('a text on the screen', 'текст на экране'));
      } else if (t === 'LayerMask') {
        cell.v = host('layermask', 'Everything');
      }
    }
  }

  // ---------------------------------------------------------------------------- Unity 3D API

  inspector(): { name: string; value: string }[] {
    const inst = this.insts[0];
    if (!inst?.self) return [];
    return [...inst.self.fields.entries()].map(([name, c]) => ({ name, value: csText(c.v, c.type) || (c.v === null ? 'None' : '') }));
  }

  private keyName(code: V): string {
    const name = typeof code === 'object' && code?.k === 'enum' ? code.name : String(code);
    const map: Record<string, string> = { Space: ' ', LeftShift: 'Shift', RightShift: 'Shift', LeftControl: 'Control', RightControl: 'Control', Escape: 'Escape', Return: 'Enter', Tab: 'Tab', UpArrow: 'ArrowUp', DownArrow: 'ArrowDown', LeftArrow: 'ArrowLeft', RightArrow: 'ArrowRight' };
    if (/^Alpha\d$/.test(name)) return name[5];
    if (/^Mouse[0-2]$/.test(name)) return name;
    return map[name] ?? name.toLowerCase();
  }

  private keyState(code: V, set: Set<string>, mouse: Set<number>): boolean {
    const k = this.keyName(code);
    if (/^Mouse[0-2]$/.test(k)) return mouse.has(Number(k[5]));
    return set.has(k);
  }

  private makeHost(program: CsProgram) {
    const world = this;
    void program;
    const objOf = (v: V): Obj3 | null => {
      if (v && typeof v === 'object') {
        if (v.k === 'host' && ['gameObject', 'collider', 'transform', 'rigidbody', 'cc', 'health', 'camera'].includes(v.kind)) return v.ref as Obj3;
        if (v.k === 'obj' && v.host) return v.host as Obj3;
      }
      return null;
    };
    const num = (v: V, d = 0) => (typeof v === 'number' ? v : d);
    const instOf = (self: ObjV | null) => world.insts.find((i) => i.self === self);
    const meOf = (self: ObjV | null): Obj3 => (self?.host as Obj3 | undefined) ?? world.player;
    const setRef = (v: V, value: V) => {
      if (v && typeof v === 'object' && v.k === 'host' && v.kind === 'ref') (v.ref as Cell).v = value;
    };
    const component = (type: string, o: Obj3, line: number): V => {
      switch (type) {
        case 'Transform':
          return host('transform', o);
        case 'CharacterController':
          if (!o.cc) throw new CsError(tr('This object has no CharacterController (GetComponent returns null).', 'У этого объекта нет CharacterController (GetComponent вернёт null).'), line, 'runtime', 'NullReferenceException');
          return host('cc', o);
        case 'Rigidbody':
          if (!o.rb) return null;
          return host('rigidbody', o);
        case 'Camera':
          return host('camera', o === world.player ? world.camera : o);
        case 'Health':
        case 'Damageable':
          return o.health ? host('health', o) : null;
        case 'Animator':
          return host('animator', o);
        case 'AudioSource':
          return host('audio', o);
        case 'Collider':
        case 'BoxCollider':
        case 'CapsuleCollider':
          return host('collider', o);
      }
      for (const inst of world.insts) if (inst.obj === o && inst.cls.name === type) return inst.self;
      return null;
    };
    /** GetComponent looks at the object; …InParent also at its parents; …InChildren also at its children. */
    const findComponent = (how: string, type: string, o: Obj3, line: number): V => {
      const has = (x: Obj3) => {
        if (type === 'CharacterController') return !!x.cc;
        if (type === 'Health' || type === 'Damageable') return !!x.health;
        if (type === 'Rigidbody') return !!x.rb;
        if (type === 'Camera') return x === world.camera || x === world.player;
        if (['Transform', 'Animator', 'AudioSource', 'Collider', 'BoxCollider', 'CapsuleCollider'].includes(type)) return true;
        return world.insts.some((i) => i.obj === x && i.cls.name === type);
      };
      if (how === 'GetComponentInParent') for (let p: Obj3 | undefined = o; p; p = p.parent) if (has(p)) return component(type, p, line);
      if (how === 'GetComponentInChildren') {
        if (has(o)) return component(type, o, line);
        const c = world.objects.find((x) => x !== o && world.isPartOf(x, o) && has(x));
        if (c) return component(type, c, line);
      }
      if (how !== 'GetComponent' && !has(o)) {
        if (type === 'CharacterController') throw new CsError(tr('No CharacterController found here (the result is null).', 'CharacterController здесь не найден (результат null).'), line, 'runtime', 'NullReferenceException');
        return null;
      }
      return component(type, o, line);
    };
    const right = (o: Obj3) => qRotate(o.rot, v3(1, 0, 0));
    const fwd = (o: Obj3) => qRotate(o.rot, v3(0, 0, 1));
    const up = (o: Obj3) => qRotate(o.rot, v3(0, 1, 0));
    const isWorld = (v: V) => !!v && typeof v === 'object' && v.k === 'enum' && v.name === 'World';

    return {
      log(text: string) {
        world.logs.push({ time: world.time, text });
      },
      global(name: string, self: ObjV | null): V | typeof NOT_FOUND {
        const me = meOf(self);
        switch (name) {
          case 'transform':
            return host('transform', me);
          case 'gameObject':
            return host('gameObject', me);
          case 'Time':
            return host('Time', null);
          case 'Input':
            return host('Input', null);
          case 'Cursor':
            return host('Cursor', null);
          case 'Quaternion':
          case 'Physics':
          case 'GameObject':
          case 'Camera':
          case 'Space':
          case 'ForceMode':
          case 'CursorLockMode':
          case 'Object':
          case 'Application':
            return { k: 'type', name };
          case 'Quaternion.identity':
            return host('quat3', QI);
          case 'Camera.main':
            return host('camera', world.camera);
          case 'Space.World':
          case 'Space.Self':
            return { k: 'enum', type: 'Space', name: name.split('.')[1] };
          case 'CursorLockMode.Locked':
          case 'CursorLockMode.None':
          case 'CursorLockMode.Confined':
            return { k: 'enum', type: 'CursorLockMode', name: name.split('.')[1] };
          case 'ForceMode.Impulse':
          case 'ForceMode.Force':
          case 'ForceMode.VelocityChange':
          case 'ForceMode.Acceleration':
            return { k: 'enum', type: 'ForceMode', name: name.split('.')[1] };
          case 'Physics.gravity':
            return vv(v3(0, -9.81, 0));
        }
        return NOT_FOUND;
      },
      create(type: string, args: V[]): V | typeof NOT_FOUND {
        if (type === 'WaitForSeconds' || type === 'WaitForSecondsRealtime') return host('wait', num(args[0]));
        if (type === 'WaitForEndOfFrame' || type === 'WaitForFixedUpdate') return host('wait', 0);
        if (type === 'Ray') return host('ray', { origin: asV3(args[0]) ?? v3(), dir: asV3(args[1]) ?? v3(0, 0, 1) });
        if (type === 'RaycastHit') return host('hit3', null);
        return NOT_FOUND;
      },
      arith(op: string, a: V, b: V): V | typeof NOT_FOUND {
        const qa = quatOf(a);
        const qb = quatOf(b);
        if (op === '*' && qa && qb) return host('quat3', qMul(qa, qb));
        if (op === '*' && qa && asV3(b)) return vv(qRotate(qa, asV3(b)!));
        return NOT_FOUND;
      },
      call(name: string, args: V[], self: ObjV | null, line: number): V | typeof NOT_FOUND {
        const me = meOf(self);
        const inst = instOf(self);
        if (name === 'Destroy') {
          const o = objOf(args[0]);
          if (o === world.player) throw new CsError(tr('Do not destroy the player — the camera is on it.', 'Не уничтожай игрока — на нём камера.'), line);
          if (o) o.alive = false;
          return undefined;
        }
        if (name === 'StartCoroutine' && inst) return world.startCoroutine(inst, args[0], line);
        if (name === 'StopAllCoroutines') {
          world.coroutines = world.coroutines.filter((c) => c.inst !== inst);
          return undefined;
        }
        const gc = /^(GetComponent|GetComponentInChildren|GetComponentInParent)<(\w+)>$/.exec(name);
        if (gc) return findComponent(gc[1], gc[2], me, line);
        if (name === 'print') {
          world.logs.push({ time: world.time, text: csText(args[0]) });
          return undefined;
        }
        return NOT_FOUND;
      },
      static(type: string, name: string, args: V[], line: number): V | typeof NOT_FOUND {
        switch (`${type}.${name}`) {
          case 'Quaternion.Euler': {
            const e = asV3(args[0]);
            return host('quat3', e ? qEuler(e.x, e.y, e.z) : qEuler(num(args[0]), num(args[1]), num(args[2])));
          }
          case 'Quaternion.AngleAxis':
            return host('quat3', qAxis(norm(asV3(args[1]) ?? v3(0, 1, 0)), num(args[0])));
          case 'Quaternion.LookRotation':
            return host('quat3', qLook(asV3(args[0]) ?? v3(0, 0, 1)));
          case 'Quaternion.Slerp':
          case 'Quaternion.Lerp':
            return host('quat3', qSlerp(quatOf(args[0]) ?? QI, quatOf(args[1]) ?? QI, Math.min(1, Math.max(0, num(args[2])))));
          case 'Quaternion.Inverse':
            return host('quat3', qInv(quatOf(args[0]) ?? QI));
          case 'Physics.Raycast': {
            // Raycast(origin, dir, out hit, dist) or Raycast(ray, out hit, dist) or Raycast(origin, dir, dist)
            let origin: V3;
            let dir: V3;
            let rest: V[];
            const r0 = args[0];
            if (r0 && typeof r0 === 'object' && r0.k === 'host' && r0.kind === 'ray') {
              const ray = r0.ref as { origin: V3; dir: V3 };
              origin = ray.origin;
              dir = ray.dir;
              rest = args.slice(1);
            } else {
              origin = asV3(args[0]) ?? v3();
              dir = asV3(args[1]) ?? v3(0, 0, 1);
              rest = args.slice(2);
            }
            const outArg = rest.find((a) => a && typeof a === 'object' && a.k === 'host' && a.kind === 'ref');
            const dist = (rest.find((a) => typeof a === 'number') as number | undefined) ?? 1000;
            const hit = world.raycast(origin, dir, dist);
            world.lastRay = hit ? { obj: hit.obj, point: hit.point, frame: world.frameNo } : null;
            const end = hit ? hit.point : add(origin, mul(norm(dir), Math.min(dist, 80)));
            world.shots.push({ from: origin, to: end, at: world.time, hit: !!hit, byBot: false });
            if (outArg) setRef(outArg, hit ? host('hit3', hit) : host('hit3', null));
            return !!hit;
          }
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
          case 'Application.Quit':
            return undefined;
          case 'Debug.DrawRay':
          case 'Debug.DrawLine': {
            const a0 = asV3(args[0]);
            const a1 = asV3(args[1]);
            if (a0 && a1) world.rays.push({ from: a0, to: name === 'DrawRay' ? add(a0, a1) : a1, color: args[2] && typeof args[2] === 'object' && args[2].k === 'enum' ? args[2].name : 'white' });
            return undefined;
          }
        }
        void line;
        return NOT_FOUND;
      },
      get(target: HostV, name: string, line: number): V | typeof NOT_FOUND {
        const o = target.ref as Obj3;
        switch (target.kind) {
          case 'transform':
            switch (name) {
              case 'position':
                return vv(o.pos);
              case 'localPosition':
                return vv(o.local ? o.local.pos : o.pos);
              case 'rotation':
                return host('quat3', o.rot);
              case 'localRotation':
                return host('quat3', o.local ? o.local.rot : o.rot);
              case 'eulerAngles':
                return vv(qToEuler(o.rot));
              case 'localEulerAngles':
                return vv(qToEuler(o.local ? o.local.rot : o.rot));
              case 'forward':
                return vv(fwd(o));
              case 'right':
                return vv(right(o));
              case 'up':
                return vv(up(o));
              case 'localScale':
                return vv(o.scale);
              case 'gameObject':
                return host('gameObject', o);
              case 'parent':
                return o.parent ? host('transform', o.parent) : null;
              case 'name':
                return o.name;
              case 'tag':
                return o.tag;
            }
            break;
          case 'gameObject':
          case 'collider':
            if (name === 'transform') return host('transform', o);
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'name') return o.name;
            if (name === 'tag') return o.tag;
            if (name === 'activeSelf') return o.alive;
            break;
          case 'Time':
            if (name === 'deltaTime' || name === 'fixedDeltaTime') return Math.fround(world.sdt);
            if (name === 'time') return Math.fround(world.time);
            if (name === 'timeScale') return world.timeScale;
            if (name === 'unscaledDeltaTime') return Math.fround(world.dt);
            break;
          case 'Cursor':
            if (name === 'lockState') return { k: 'enum', type: 'CursorLockMode', name: world.cursorLocked ? 'Locked' : 'None' };
            if (name === 'visible') return !world.cursorLocked;
            break;
          case 'cc':
            if (name === 'isGrounded') return !!o.cc?.grounded;
            if (name === 'height') return o.cc?.height ?? 1.8;
            if (name === 'radius') return o.cc?.radius ?? 0.4;
            if (name === 'velocity') return vv(o.vel);
            if (name === 'transform') return host('transform', o);
            break;
          case 'rigidbody':
            if (name === 'velocity' || name === 'linearVelocity') return vv(o.vel);
            if (name === 'useGravity') return !!o.rb?.useGravity;
            if (name === 'position') return vv(o.pos);
            break;
          case 'camera':
            if (name === 'fieldOfView') return o.fov ?? 70;
            if (name === 'transform') return host('transform', o);
            break;
          case 'health':
            if (name === 'value' || name === 'current' || name === 'currentHealth' || name === 'Health' || name === 'health') return o.health?.value ?? 0;
            if (name === 'max' || name === 'maxHealth') return o.health?.max ?? 0;
            if (name === 'transform') return host('transform', o);
            if (name === 'gameObject') return host('gameObject', o);
            if (name === 'IsDead' || name === 'isDead') return (o.health?.value ?? 0) <= 0;
            break;
          case 'hit3': {
            const h = target.ref as { obj: Obj3; point: V3; normal: V3; distance: number } | null;
            if (!h) {
              throw new CsError(tr('The ray hit nothing, so the hit is empty. Check the result of Physics.Raycast first: if (Physics.Raycast(…)) { … }', 'Луч ни во что не попал, поэтому hit пустой. Сначала проверь результат Physics.Raycast: if (Physics.Raycast(…)) { … }'), line, 'runtime', 'NullReferenceException');
            }
            if (name === 'collider') return host('collider', h.obj);
            if (name === 'transform') return host('transform', h.obj);
            if (name === 'point') return vv(h.point);
            if (name === 'normal') return vv(h.normal);
            if (name === 'distance') return h.distance;
            break;
          }
          case 'quat3':
            if (name === 'eulerAngles') return vv(qToEuler(target.ref as Q));
            break;
          case 'uitext':
            if (name === 'text') return (target.ref as { text: string }).text;
            break;
        }
        return NOT_FOUND;
      },
      set(target: HostV, name: string, value: V, line: number): boolean {
        const o = target.ref as Obj3;
        const vec = asV3(value);
        if (target.kind === 'transform') {
          if (name === 'position' && vec) {
            if (o.local && o.parent) o.local.pos = qRotate(qInv(o.parent.rot), sub(vec, o.parent.pos));
            else o.pos = vec;
            return true;
          }
          if (name === 'localPosition' && vec) {
            if (o.local) o.local.pos = vec;
            else o.pos = vec;
            return true;
          }
          if (name === 'rotation' && quatOf(value)) {
            if (o.local && o.parent) o.local.rot = qMul(qInv(o.parent.rot), quatOf(value)!);
            else o.rot = quatOf(value)!;
            return true;
          }
          if (name === 'localRotation' && quatOf(value)) {
            if (o.local) o.local.rot = quatOf(value)!;
            else o.rot = quatOf(value)!;
            return true;
          }
          if ((name === 'eulerAngles' || name === 'localEulerAngles') && vec) {
            const q = qEuler(vec.x, vec.y, vec.z);
            if (name === 'localEulerAngles' && o.local) o.local.rot = q;
            else o.rot = q;
            return true;
          }
          if (name === 'localScale' && vec) {
            o.scale = vec;
            return true;
          }
        }
        if (target.kind === 'Cursor' && name === 'lockState') {
          world.cursorLocked = !!value && typeof value === 'object' && value.k === 'enum' && value.name === 'Locked';
          return true;
        }
        if (target.kind === 'Cursor' && name === 'visible') return true;
        if (target.kind === 'Time' && name === 'timeScale' && typeof value === 'number') {
          world.timeScale = Math.max(0, value);
          return true;
        }
        if (target.kind === 'camera' && name === 'fieldOfView' && typeof value === 'number') {
          o.fov = Math.min(150, Math.max(10, value));
          return true;
        }
        if (target.kind === 'rigidbody' && (name === 'velocity' || name === 'linearVelocity') && vec) {
          o.vel = vec;
          return true;
        }
        if (target.kind === 'rigidbody' && name === 'useGravity' && o.rb) {
          o.rb.useGravity = value === true;
          return true;
        }
        if ((target.kind === 'cc' && (name === 'height' || name === 'radius')) && typeof value === 'number' && o.cc) {
          if (name === 'height') {
            const old = o.cc.height;
            const h = Math.max(0.6, value);
            if (Math.abs(h - old) < 1e-6) return true;
            const saved = { pos: { ...o.pos }, half: o.half.y };
            o.cc.height = h;
            o.half.y = h / 2;
            o.pos.y -= (old - h) / 2;
            // standing up under something low is impossible: stay crouched (like a real body)
            if (h > old && world.solids(o).some((x) => world.overlapsPublic(o, x))) {
              o.cc.height = old;
              o.half.y = saved.half;
              o.pos = saved.pos;
              return true;
            }
            if (o === world.player) world.head.local!.pos.y = Math.max(0.2, h / 2 - 0.2);
          } else o.cc.radius = value;
          return true;
        }
        if (target.kind === 'uitext' && name === 'text') {
          (target.ref as { text: string }).text = csText(value);
          return true;
        }
        if ((target.kind === 'gameObject' || target.kind === 'collider') && name === 'name' && typeof value === 'string') {
          o.name = value;
          return true;
        }
        void line;
        return false;
      },
      method(target: HostV, name: string, args: V[], line: number): V | typeof NOT_FOUND {
        const o = target.ref as Obj3;
        const plain = name.replace(/<.*$/, '');
        const gc = /^(GetComponent|GetComponentInChildren|GetComponentInParent)<(\w+)>$/.exec(name);
        if (gc && ['gameObject', 'collider', 'transform', 'rigidbody', 'cc', 'camera', 'health'].includes(target.kind)) return findComponent(gc[1], gc[2], o, line);
        switch (`${target.kind}.${plain}`) {
          case 'Input.GetKey':
            return world.keyState(args[0], world.keys, world.mouseDown);
          case 'Input.GetKeyDown':
            return world.keyState(args[0], world.pressed, world.mousePressed);
          case 'Input.GetKeyUp':
            return world.keyState(args[0], world.released, world.mouseReleased);
          case 'Input.GetMouseButton':
            return world.mouseDown.has(num(args[0]));
          case 'Input.GetMouseButtonDown':
            return world.mousePressed.has(num(args[0]));
          case 'Input.GetMouseButtonUp':
            return world.mouseReleased.has(num(args[0]));
          case 'Input.GetButton':
          case 'Input.GetButtonDown': {
            const b = csText(args[0]);
            const set = plain === 'GetButton' ? world.keys : world.pressed;
            const ms = plain === 'GetButton' ? world.mouseDown : world.mousePressed;
            if (b === 'Jump') return set.has(' ');
            if (b === 'Fire1') return ms.has(0) || set.has('Control');
            if (b === 'Fire2') return ms.has(1);
            return set.has(b.toLowerCase());
          }
          case 'Input.GetAxis':
          case 'Input.GetAxisRaw': {
            const axis = csText(args[0]);
            const k = world.keys;
            if (axis === 'Horizontal') return (k.has('d') || k.has('ArrowRight') ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') ? 1 : 0);
            if (axis === 'Vertical') return (k.has('w') || k.has('ArrowUp') ? 1 : 0) - (k.has('s') || k.has('ArrowDown') ? 1 : 0);
            if (axis === 'Mouse X') return world.mouse.dx;
            if (axis === 'Mouse Y') return world.mouse.dy;
            if (axis === 'Mouse ScrollWheel') return 0;
            throw new CsError(tr(`Unknown input axis "${axis}". Use "Horizontal", "Vertical", "Mouse X" or "Mouse Y".`, `Неизвестная ось ввода «${axis}». Используй "Horizontal", "Vertical", "Mouse X" или "Mouse Y".`), line);
          }
          case 'transform.Translate': {
            const v = asV3(args[0]) ?? v3(num(args[0]), num(args[1]), num(args[2]));
            const worldSpace = isWorld(args[1]) || isWorld(args[3]);
            const d = worldSpace ? v : qRotate(o.rot, v);
            if (o.local && o.parent) o.local.pos = add(o.local.pos, qRotate(qInv(o.parent.rot), d));
            else o.pos = add(o.pos, d);
            return undefined;
          }
          case 'transform.Rotate': {
            const e = asV3(args[0]) ?? v3(num(args[0]), num(args[1]), num(args[2]));
            const worldSpace = isWorld(args[1]) || isWorld(args[3]);
            const q = qEuler(e.x, e.y, e.z);
            if (o.local && o.parent) o.local.rot = worldSpace ? qMul(qMul(qInv(o.parent.rot), q), qMul(o.parent.rot, o.local.rot)) : qMul(o.local.rot, q);
            else o.rot = worldSpace ? qMul(q, o.rot) : qMul(o.rot, q);
            return undefined;
          }
          case 'transform.LookAt': {
            const t = objOf(args[0])?.pos ?? asV3(args[0]);
            if (t && len(sub(t, o.pos)) > 1e-6) o.rot = qLook(sub(t, o.pos));
            return undefined;
          }
          case 'transform.TransformDirection':
            return vv(qRotate(o.rot, asV3(args[0]) ?? v3(num(args[0]), num(args[1]), num(args[2]))));
          case 'transform.InverseTransformDirection':
            return vv(qRotate(qInv(o.rot), asV3(args[0]) ?? v3()));
          case 'transform.TransformPoint':
            return vv(add(o.pos, qRotate(o.rot, asV3(args[0]) ?? v3())));
          case 'transform.Find': {
            const n = csText(args[0]);
            const c = world.objects.find((x) => x.name === n && (x.parent === o || x.parent?.parent === o || x.parent?.parent?.parent === o));
            return c ? host('transform', c) : null;
          }
          case 'transform.CompareTag':
          case 'gameObject.CompareTag':
          case 'collider.CompareTag':
            return o.tag === csText(args[0]);
          case 'gameObject.SetActive':
            o.hidden = args[0] === false;
            return undefined;
          case 'cc.Move': {
            const d = asV3(args[0]) ?? v3();
            if (o.moveFrom?.frame !== world.frameNo) o.moveFrom = { frame: world.frameNo, pos: { ...o.pos } };
            const landed = world.moveCollide(o, d);
            // like Unity: grounded when the move pushed into the ground, or (moving sideways only) still standing on it
            const grounded = landed || (d.y <= 0 && world.supported(o));
            o.cc = { ...(o.cc ?? { height: 1.8, radius: 0.3 }), grounded };
            // velocity of the whole frame (scripts often call Move twice: walking, then gravity)
            o.vel = mul(sub(o.pos, o.moveFrom.pos), 1 / Math.max(1e-6, world.sdt));
            return undefined;
          }
          case 'cc.SimpleMove': {
            const d = asV3(args[0]) ?? v3();
            const grounded = world.moveCollide(o, v3(d.x * world.sdt, -9.81 * world.sdt, d.z * world.sdt));
            o.cc = { ...(o.cc ?? { height: 1.8, radius: 0.3 }), grounded };
            return grounded;
          }
          case 'rigidbody.AddForce': {
            const v = asV3(args[0]) ?? v3();
            const impulse = !!args[1] && typeof args[1] === 'object' && args[1].k === 'enum' && (args[1].name === 'Impulse' || args[1].name === 'VelocityChange');
            o.vel = add(o.vel, impulse ? v : mul(v, world.sdt));
            return undefined;
          }
          case 'rigidbody.AddExplosionForce': {
            const force = num(args[0]);
            const at = asV3(args[1]) ?? o.pos;
            const radius = num(args[2], 5);
            const d = sub(o.pos, at);
            const k = Math.max(0, 1 - len(d) / radius);
            o.vel = add(o.vel, mul(norm(add(d, v3(0, 0.5, 0))), (force * k) / 10));
            return undefined;
          }
          case 'rigidbody.MovePosition': {
            const v = asV3(args[0]);
            if (v) o.pos = v;
            return undefined;
          }
          case 'health.TakeDamage':
          case 'health.Damage':
            world.damage(o, num(args[0]));
            return undefined;
          case 'health.Heal':
            if (o.health) o.health.value = Math.min(o.health.max, o.health.value + num(args[0]));
            return undefined;
          case 'camera.ScreenPointToRay':
          case 'camera.ViewportPointToRay':
            return host('ray', { origin: { ...o.pos }, dir: fwd(o) });
          case 'animator.SetFloat':
          case 'animator.SetBool':
          case 'animator.SetTrigger':
          case 'animator.SetInteger':
            return undefined;
          case 'audio.Play':
          case 'audio.PlayOneShot':
            world.logs.push({ time: world.time, text: `🔊 ${args[0] && typeof args[0] === 'object' && args[0].k === 'host' ? String(args[0].ref) : tr('sound', 'звук')}` });
            return undefined;
          case 'layermask.value':
            return -1;
        }
        return NOT_FOUND;
      },
    };
  }

  /** For the renderer: the eye (camera) position and rotation. */
  eye(): { pos: V3; rot: Q; fov: number } {
    return { pos: this.camera.pos, rot: this.camera.rot, fov: this.camera.fov ?? 70 };
  }
}

export const fmtV3 = (a: V3) => `(${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.z.toFixed(1)})`;
export type { Text2 };
