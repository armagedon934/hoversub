// Campaign "Shooter from zero": 25 missions in which the learner restores the systems of a soldier
// by writing the scripts of a first-person shooter in real Unity C#. Each mission = one small idea,
// a script with a few blanks (___) to fill, a goal checked inside the game, and a new ability.
// It starts in a calm, softly lit empty room and ends in a full match against bots on a map.
// Everything here is pure data + checks (tested); drawing is in Scene3D, the screen in Shooter.tsx.

import { pick, tr, type Text2 } from '../i18n';
import { QI, qRotate, qToEuler, v3, World3D, type DemoStep3, type Level3, type Obj3, type Spec3, type V3 } from './unity3d';

// ------------------------------------------------------------------------------------ types

export interface MissionGoal {
  text: Text2;
  /** Checked every frame; once true it stays done. */
  check: (w: World3D, run: MissionRun) => boolean;
}

export interface MissionRun {
  /** Free memory for goals (timers, things seen…). */
  mem: Record<string, number>;
  code: string;
}

export interface Mission {
  id: string;
  chapter: number;
  icon: string;
  /** Name of the mission (what the player is doing). */
  title: Text2;
  /** The system of the suit that this mission brings back (shown in the "suit" panel). */
  system: Text2;
  /** A short radio message from the instructor: the story. */
  radio: Text2;
  /** What to do, in one line. */
  task: Text2;
  /** New words of this mission (1–3), each with a plain explanation. */
  words: { word: string; say: Text2 }[];
  hints: Text2[];
  /** The script with blanks marked ⟦…⟧ (the text between the brackets is the answer). */
  code: () => string;
  file: string;
  /** Object the learner's script is put on (default: the player). "#Tag" = every object with the tag. */
  attachTo?: string;
  level: () => Level3;
  goals: MissionGoal[];
  /** Keys the player can use in this mission (shown under the game). */
  keys: string[];
  /** The new ability, shown when the mission is complete. */
  ability: Text2;
  /** How to build the same thing in the real Unity editor. */
  inUnity: Text2;
  /** "Show me how to play": inputs that complete the goals with the right script (also used by tests). */
  demo: (t: number, w: World3D, run: MissionRun) => DemoStep3;
  demoSeconds: number;
}

export const CHAPTERS: { n: number; icon: string; title: Text2; about: Text2 }[] = [
  { n: 1, icon: '🌫', title: { en: 'Waking up', ru: 'Пробуждение' }, about: { en: 'Comms, legs, eyes, body: the basics of C# and of moving in 3D.', ru: 'Связь, ноги, глаза, тело: основы C# и движение в 3D.' } },
  { n: 2, icon: '🎯', title: { en: 'Shooting range', ru: 'Стрельбище' }, about: { en: 'Rays, damage, magazines, automatic fire, a shotgun and your own weapon classes.', ru: 'Лучи, урон, магазин, автоматический огонь, дробовик и свои классы оружия.' } },
  { n: 3, icon: '🤖', title: { en: 'The enemy', ru: 'Враг' }, about: { en: 'Bots: patrol, eyes, and a brain that decides when to shoot.', ru: 'Боты: патруль, глаза и мозг, который решает, когда стрелять.' } },
  { n: 4, icon: '🧠', title: { en: 'Living bots', ru: 'Живые боты' }, about: { en: 'Watch bots and make them human: smooth turning, reaction time, a calming aim, glances, memory, character.', ru: 'Наблюдай за ботами и сделай их людьми: плавный поворот, время реакции, успокаивающийся прицел, оглядывание, память, характер.' } },
  { n: 5, icon: '🌬', title: { en: 'Atmosphere', ru: 'Атмосфера' }, about: { en: 'A body that feels alive: inertia, head bob, speed, leaning, a living weapon, a walking bot.', ru: 'Тело, которое ощущается живым: инерция, покачивание головы, скорость, наклоны, живое оружие, шагающий бот.' } },
  { n: 6, icon: '🏜', title: { en: 'Operation', ru: 'Операция' }, about: { en: 'A real match on a map: your team against the bots.', ru: 'Настоящий матч на карте: твоя команда против ботов.' } },
];

// ------------------------------------------------------------------------------------ blanks

const BLANK = /⟦([^⟧]*)⟧/g;
/** The script the learner starts with: blanks become ___. */
export const starterOf = (m: Mission): string => m.code().replace(BLANK, '___');
/** The finished script (the answer). */
export const answerOf = (m: Mission): string => m.code().replace(BLANK, '$1');
/** The answers of the blanks, in order. */
export const blanksOf = (m: Mission): string[] => [...m.code().matchAll(BLANK)].map((x) => x[1]);
/** How many ___ are still in the code. */
export const openBlanks = (code: string): number => code.split('___').length - 1;
/** Line numbers (0-based) that still have ___. */
export const blankLines = (code: string): number[] => code.split('\n').flatMap((l, i) => (l.includes('___') ? [i] : []));

// ------------------------------------------------------------------------------------ helpers

const T = (en: string, ru: string): Text2 => ({ en, ru });
const D2R = Math.PI / 180;

/** A box room: floor, four walls. Soft colours by default (calm for the eyes). */
function room(size: number, o: { wall?: string; height?: number } = {}): Spec3[] {
  const h = o.height ?? 4;
  const c = o.wall ?? '#cfd4db';
  const half = size / 2;
  return [
    { name: 'Wall', shape: 'box', pos: [0, h / 2, half], size: [size, h, 0.4], color: c },
    { name: 'Wall', shape: 'box', pos: [0, h / 2, -half], size: [size, h, 0.4], color: c },
    { name: 'Wall', shape: 'box', pos: [half, h / 2, 0], size: [0.4, h, size], color: c },
    { name: 'Wall', shape: 'box', pos: [-half, h / 2, 0], size: [0.4, h, size], color: c },
  ];
}
const zone = (name: string, x: number, z: number, r = 1.1, y = 0): Spec3 => ({ name, tag: 'Zone', shape: 'zone', pos: [x, y + 0.05, z], size: [r * 2, 0.1, r * 2], color: '#ffd166', emissive: true });
const lamp = (name: string, x: number, y: number, z: number): Spec3 => ({ name, tag: 'Lamp', shape: 'sphere', pos: [x, y, z], size: [0.5, 0.5, 0.5], color: '#9aa7b8', solid: false });
const target = (name: string, x: number, z: number, hp = 1, extra: Partial<Spec3> = {}): Spec3 => ({ name, tag: 'Target', shape: 'target', pos: [x, 1.5, z], size: [0.9, 0.9, 0.12], color: '#e85d4a', health: hp, ...extra });
const crate = (x: number, z: number, s = 1.2, h = s): Spec3 => ({ name: 'Crate', shape: 'box', pos: [x, h / 2, z], size: [s, h, s], color: '#a07a4e' });
const wall = (x: number, z: number, w: number, d: number, h = 3, color = '#c2a77f'): Spec3 => ({ name: 'Wall', shape: 'box', pos: [x, h / 2, z], size: [w, h, d], color });

const objByName = (w: World3D, name: string) => w.objects.find((o) => o.name === name);
const logged = (w: World3D, re: RegExp) => w.logs.some((l) => !l.text.startsWith('Inspector:') && re.test(l.text));
const anyLog = (w: World3D) => w.logs.some((l) => !l.text.startsWith('Inspector:') && !/^[☠🎯👥🔊]/u.test(l.text) && l.text.trim().length > 0);
const field = (w: World3D, name: string): unknown => {
  for (const i of w.insts) {
    const c = i.self?.fields.get(name);
    if (c) return c.v;
  }
  return undefined;
};
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);

/** Is the player standing in the zone? Marks it as reached (it turns green). */
function inZone(w: World3D, name: string): boolean {
  const z = objByName(w, name);
  if (!z) return false;
  const p = w.player;
  const feet = p.pos.y - p.half.y;
  const ok = Math.abs(p.pos.x - z.pos.x) < z.half.x && Math.abs(p.pos.z - z.pos.z) < z.half.z && Math.abs(feet - (z.pos.y - 0.05)) < 0.5;
  if (ok) z.color = '#3ad17a';
  return ok;
}
/** Camera forward vector and the angle (degrees) to a point. */
function angleTo(w: World3D, p: V3): number {
  const f = qRotate(w.camera.rot, v3(0, 0, 1));
  const d = v3(p.x - w.camera.pos.x, p.y - w.camera.pos.y, p.z - w.camera.pos.z);
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (f.x * d.x + f.y * d.y + f.z * d.z) / l))) / D2R;
}
/** The player looks at the object (within a few degrees). Marks it as seen (it lights up). */
function lookedAt(w: World3D, name: string, deg = 7): boolean {
  const o = objByName(w, name);
  if (!o) return false;
  const ok = angleTo(w, o.pos) < deg;
  if (ok) {
    o.color = '#ffd166';
    o.emissive = true;
  }
  return ok;
}
const aliveWith = (w: World3D, tag: string) => w.objects.filter((o) => o.alive && o.tag === tag);
const sticky = (run: MissionRun, key: string, now: boolean) => {
  if (now) run.mem[key] = 1;
  return run.mem[key] === 1;
};

const add3 = (p: V3, dy: number): V3 => v3(p.x, p.y + dy, p.z);
/** Does the bot face the player (within deg, on the ground plane)? */
function faces(w: World3D, name: string, deg: number): boolean {
  const bot = objByName(w, name);
  if (!bot) return false;
  const f = qRotate(bot.rot, v3(0, 0, 1));
  const to = v3(w.player.pos.x - bot.pos.x, 0, w.player.pos.z - bot.pos.z);
  const l = Math.hypot(to.x, to.z) * Math.hypot(f.x, f.z) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (f.x * to.x + f.z * to.z) / l))) / D2R < deg;
}
/** Remembers the fastest turn of the bot (degrees per second). */
function trackYawRate(w: World3D, r: MissionRun, name: string): void {
  const bot = objByName(w, name);
  if (!bot) return;
  const yaw = qToEuler(bot.rot).y;
  if (r.mem.lastYaw === undefined && w.frameNo === 1) {
    // the first frame: compare with how the bot stood when the level started
    r.mem.lastYaw = w.level.objects.find((o) => o.name === name)?.rot?.[1] ?? 0;
    r.mem.lastYawFrame = 0;
  }
  if (r.mem.lastYaw !== undefined && r.mem.lastYawFrame === w.frameNo - 1) {
    const d = Math.abs(((yaw - r.mem.lastYaw + 540) % 360) - 180);
    r.mem.maxRate = Math.max(r.mem.maxRate ?? 0, d / w.dt);
  }
  r.mem.lastYaw = yaw;
  r.mem.lastYawFrame = w.frameNo;
}
/** Is there a free line from the bot's eyes to the player? */
function botSees(w: World3D, name: string): boolean {
  const bot = objByName(w, name);
  if (!bot) return false;
  const eye = add3(bot.pos, 0.7);
  const hit = w.raycast(eye, v3(w.player.pos.x - eye.x, w.player.pos.y - eye.y, w.player.pos.z - eye.z), 60, [bot]);
  return !!hit && w.isPartOf(hit.obj, w.player);
}
/** The head of a bot turned left/right, degrees (−180…180). */
function headYaw(w: World3D, name: string): number {
  const h = objByName(w, name)?.bones?.Head?.local?.rot;
  if (!h) return 0;
  const y = qToEuler(h).y;
  return y > 180 ? y - 360 : y;
}

// --------------------------------------------------------------------------------- autopilot

/** Where the camera looks: yaw and pitch (pitch > 0 = down), degrees. */
function camAngles(w: World3D): { yaw: number; pitch: number } {
  const f = qRotate(w.camera.rot, v3(0, 0, 1));
  return { yaw: Math.atan2(f.x, f.z) / D2R, pitch: -Math.asin(Math.max(-1, Math.min(1, f.y))) / D2R };
}
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** Mouse movement that turns the camera towards a point (for "show me" and tests). */
export function aimAt(w: World3D, p: V3, sens = 2): { mouse: [number, number]; err: number } {
  const d = v3(p.x - w.camera.pos.x, p.y - w.camera.pos.y, p.z - w.camera.pos.z);
  const want = { yaw: Math.atan2(d.x, d.z) / D2R, pitch: -Math.atan2(d.y, Math.hypot(d.x, d.z)) / D2R };
  const now = camAngles(w);
  const ey = wrap180(want.yaw - now.yaw);
  const ep = want.pitch - now.pitch;
  const lim = 9;
  return { mouse: [Math.max(-lim, Math.min(lim, ey / sens)), Math.max(-lim, Math.min(lim, -ep / sens))], err: Math.hypot(ey, ep) };
}
/** Keys that walk towards a point (the player turns with the mouse first). */
function walkTo(w: World3D, p: V3, extra: string[] = []): DemoStep3 {
  const a = aimAt(w, v3(p.x, w.camera.pos.y, p.z));
  const far = Math.hypot(p.x - w.player.pos.x, p.z - w.player.pos.z) > 0.25;
  // blocked by something low? jump over it (press Space every few frames)
  const stuck = far && a.err < 25 && Math.hypot(w.player.vel.x, w.player.vel.z) < 0.5 && w.frameNo % 20 === 0;
  return { until: 1e9, mouse: a.mouse, keys: far && a.err < 25 ? ['w', ...extra, ...(stuck ? [' '] : [])] : extra };
}
/** Shoot every alive object with the tag: aim, then click (or hold for automatic weapons). */
function shootAll(w: World3D, tag: string | ((o: Obj3) => boolean), hold = false, keys: string[] = []): DemoStep3 {
  const list = w.objects.filter((o) => o.alive && (typeof tag === 'string' ? o.tag === tag : tag(o)));
  list.sort((a, b) => Math.hypot(a.pos.x - w.player.pos.x, a.pos.z - w.player.pos.z) - Math.hypot(b.pos.x - w.player.pos.x, b.pos.z - w.player.pos.z));
  const t = list.find((o) => {
    const eye = w.camera.pos;
    const d = v3(o.pos.x - eye.x, o.pos.y + 0.1 - eye.y, o.pos.z - eye.z);
    const hit = w.raycast(eye, d, 200);
    return hit && w.isPartOf(hit.obj, o);
  });
  if (!t) return { until: 1e9, keys };
  const a = aimAt(w, v3(t.pos.x, t.pos.y + 0.1, t.pos.z));
  const dist = Math.hypot(t.pos.x - w.camera.pos.x, t.pos.z - w.camera.pos.z);
  const ready = a.err < Math.min(1.2, (Math.atan(0.25 / Math.max(1, dist)) * 180) / Math.PI);
  return { until: 1e9, mouse: a.mouse, buttons: ready && (hold || Math.floor(w.frameNo / 4) % 2 === 0) ? [0] : [], keys };
}

// ------------------------------------------------------------------------- official scripts

/** Scripts the learner has already written in earlier missions — now they "just work" on the player. */
export const OFFICIAL = {
  look: `using UnityEngine;

public class MouseLook : MonoBehaviour
{
    public float sensitivity = 2f;
    public Transform cam;
    float pitch = 0f;

    void Start()
    {
        Cursor.lockState = CursorLockMode.Locked;
    }

    void Update()
    {
        float mouseX = Input.GetAxis("Mouse X") * sensitivity;
        float mouseY = Input.GetAxis("Mouse Y") * sensitivity;
        transform.Rotate(0, mouseX, 0);

        pitch -= mouseY;
        pitch = Mathf.Clamp(pitch, -80f, 80f);
        cam.localRotation = Quaternion.Euler(pitch, 0, 0);
    }
}
`,
  move: `using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    public float walkSpeed = 5f;
    public float runSpeed = 9f;
    public float gravity = -9.81f;
    public float jumpHeight = 1.3f;
    CharacterController controller;
    float velocityY;

    void Start()
    {
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        float speed = Input.GetKey(KeyCode.LeftShift) ? runSpeed : walkSpeed;
        controller.height = Input.GetKey(KeyCode.C) ? 1f : 1.8f;

        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 move = transform.right * x + transform.forward * z;
        controller.Move(move * speed * Time.deltaTime);

        if (controller.isGrounded && velocityY < 0) velocityY = -2f;
        if (Input.GetButtonDown("Jump") && controller.isGrounded)
            velocityY = Mathf.Sqrt(jumpHeight * -2f * gravity);
        velocityY += gravity * Time.deltaTime;
        controller.Move(Vector3.up * velocityY * Time.deltaTime);
    }
}
`,
  gun: `using System.Collections;
using UnityEngine;
using TMPro;

public class Gun : MonoBehaviour
{
    public Transform cam;
    public TMP_Text ammoText;
    public int damage = 34;
    public int maxAmmo = 30;
    public float fireRate = 8f;
    int ammo;
    bool reloading;
    float nextFireTime;

    void Start()
    {
        ammo = maxAmmo;
    }

    void Update()
    {
        ammoText.text = reloading ? "..." : ammo + " / " + maxAmmo;
        if (reloading) return;
        if (Input.GetKeyDown(KeyCode.R) || ammo == 0)
        {
            StartCoroutine(Reload());
            return;
        }
        if (Input.GetMouseButton(0) && Time.time >= nextFireTime)
        {
            nextFireTime = Time.time + 1f / fireRate;
            ammo--;
            Shoot();
        }
    }

    void Shoot()
    {
        if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, 200f))
        {
            Health health = hit.collider.GetComponent<Health>();
            if (health != null) health.TakeDamage(damage);
        }
    }

    IEnumerator Reload()
    {
        reloading = true;
        yield return new WaitForSeconds(1.5f);
        ammo = maxAmmo;
        reloading = false;
    }
}
`,
};
const official = (...which: (keyof typeof OFFICIAL)[]) => which.map((k) => ({ source: OFFICIAL[k], on: 'Player' }));

/** The movement used in mission 6 (the learner's script from missions 3–5: moves through walls). */
const MOVE_TRANSLATE = `using UnityEngine;

public class PlayerMove : MonoBehaviour
{
    public float speed = 5f;

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        transform.Translate(new Vector3(x, 0, z) * speed * Time.deltaTime);
    }
}
`;

// ------------------------------------------------------------------------------------ levels

const SOFT = { sky: '#dde1e6', fog: 0.035, floor: { size: 60, color: '#d6dadf' } };
const TRAINING = { sky: '#cfd8e2', fog: 0.02, floor: { size: 80, color: '#bfc6cf' } };
const RANGE = { sky: '#c9d6e3', fog: 0.012, floor: { size: 120, color: '#b9b2a4' } };
const DUSK = { sky: '#d9c4a8', fog: 0.014, floor: { size: 120, color: '#c8b48f' } };

/** The final map "Dusty Yard": three lanes, crates, two teams. */
export function dustyYard(): Spec3[] {
  const W = '#c2a77f';
  const out: Spec3[] = [...room(52, { wall: '#b59f7a', height: 5 })];
  // lane walls with doors in the middle
  for (const x of [-8, 8]) {
    out.push(wall(x, -9.5, 1, 13, 3.2, W), wall(x, 9.5, 1, 13, 3.2, W));
  }
  // cover
  out.push(crate(-12.5, -6), crate(-14, 6, 1.4), crate(-17, 13), crate(0, 0, 1.5), crate(2.2, 7.5), crate(-2.5, -9), crate(12.5, -6), crate(16, 5, 1.4), crate(13.5, 13), crate(-4, 16, 1.2), crate(4, 16, 1.2));
  out.push(wall(-20, -2, 6, 1, 1.2, '#9c8a6a'), wall(20, 2, 6, 1, 1.2, '#9c8a6a'), wall(-4, -15, 3, 1, 1.1, '#9c8a6a'), wall(4, -15, 3, 1, 1.1, '#9c8a6a'));
  // a few low walls in the middle and towers of crates
  out.push(crate(-20, 20, 2, 2.4), crate(20, 20, 2, 2.4), crate(-20, -20, 2, 2.4), crate(20, -20, 2, 2.4));
  return out;
}

const RED_TEAM: Spec3[] = [
  { name: 'Red-1', tag: 'Enemy', shape: 'humanoid', pos: [-15, 0.9, 19], rot: [0, 180, 0], bot: { waypoints: [[-15, 0.9, 19], [-15, 0.9, 1]], accuracy: 0.3, damage: 6, fireRate: 1.1 } },
  { name: 'Red-2', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 20], rot: [0, 180, 0], bot: { waypoints: [[0, 0.9, 20], [0, 0.9, 5]], accuracy: 0.3, damage: 6, fireRate: 1.1 } },
  { name: 'Red-3', tag: 'Enemy', shape: 'humanoid', pos: [15, 0.9, 19], rot: [0, 180, 0], bot: { waypoints: [[15, 0.9, 19], [15, 0.9, 1]], accuracy: 0.3, damage: 6, fireRate: 1.1 } },
  { name: 'Red-4', tag: 'Enemy', shape: 'humanoid', pos: [-4, 0.9, 12], rot: [0, 180, 0], bot: { waypoints: [[-4, 0.9, 12], [4, 0.9, 12]], accuracy: 0.32, damage: 6, fireRate: 1.2 } },
  { name: 'Red-5', tag: 'Enemy', shape: 'humanoid', pos: [9, 0.9, 22], rot: [0, 200, 0], bot: { waypoints: [[9, 0.9, 22], [-9, 0.9, 22]], accuracy: 0.32, damage: 6, fireRate: 1.2 } },
];
const BLUE_TEAM: Spec3[] = [
  { name: 'Blue-1', tag: 'Ally', shape: 'humanoid', pos: [-4, 0.9, -21], bot: { team: 'blue', waypoints: [[-15, 0.9, -18], [-15, 0.9, 12]], accuracy: 0.3, damage: 7 } },
  { name: 'Blue-2', tag: 'Ally', shape: 'humanoid', pos: [4, 0.9, -21], bot: { team: 'blue', waypoints: [[15, 0.9, -18], [15, 0.9, 12]], accuracy: 0.3, damage: 7 } },
];

// ------------------------------------------------------------------------------------ missions

export const MISSIONS: Mission[] = [
  // ======================================================================= chapter 1: waking up
  {
    id: 's01',
    chapter: 1,
    icon: '📻',
    title: T('Is anyone there?', 'Есть связь?'),
    system: T('Comms', 'Связь'),
    radio: T(
      'Soldier, can you hear me? Your suit has rebooted and everything is off — that is why you only see light fog. Let us start with the radio: say anything.',
      'Боец, слышишь меня? Твой костюм перезагрузился, всё выключено — поэтому вокруг только светлый туман. Начнём с рации: скажи что-нибудь.',
    ),
    task: T('Fill the blank with a message in quotes and press "Upload".', 'Впиши в пропуск сообщение в кавычках и нажми «Загрузить».'),
    words: [
      { word: 'Start()', say: T('Runs once, when the game starts. Like "turn on".', 'Срабатывает один раз, когда игра началась. Как «включить».') },
      { word: 'Debug.Log("…")', say: T('Prints a message to the Console — your radio.', 'Пишет сообщение в консоль — это твоя рация.') },
      { word: '"text"', say: T('Text is always in double quotes.', 'Текст всегда в двойных кавычках.') },
    ],
    hints: [T('Text goes in double quotes: "like this".', 'Текст пишется в двойных кавычках: "вот так".'), T('Example: "Copy, I am online"', 'Пример: "Приём, я на связи"')],
    code: () => `using UnityEngine;

public class Radio : MonoBehaviour
{
    void Start()
    {
        Debug.Log(⟦${tr('"Copy! Soldier online"', '"Приём! Боец на связи"')}⟧);
    }
}
`,
    file: 'Radio.cs',
    level: () => ({ id: 's01', ...SOFT, fog: 0.09, objects: [...room(16, { wall: '#d3d7dd' })], player: { pos: [0, 0.9, 0] } }),
    goals: [{ text: T('The radio says something', 'Рация что-то сказала'), check: (w) => anyLog(w) }],
    keys: [],
    ability: T('Comms work: Debug.Log messages come in as radio messages.', 'Связь работает: сообщения Debug.Log приходят как радиосообщения.'),
    inUnity: T(
      'Create an empty object (GameObject → Create Empty), add a C# script "Radio", paste the code, press Play: the message is in the Console window.',
      'Создай пустой объект (GameObject → Create Empty), добавь C#-скрипт «Radio», вставь код, нажми Play: сообщение будет в окне Console.',
    ),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 0.2,
  },
  {
    id: 's02',
    chapter: 1,
    icon: '🪪',
    title: T('Who are you?', 'Кто ты?'),
    system: T('ID card', 'Личная карта'),
    radio: T(
      'Good, I hear you. The suit asks for your data: call sign, health and speed. Write them into variables — boxes with a name.',
      'Отлично, слышу. Костюм просит твои данные: позывной, здоровье и скорость. Запиши их в переменные — коробки с именем.',
    ),
    task: T('Give yourself a call sign, health from 1 to 100 and a speed.', 'Придумай позывной, здоровье от 1 до 100 и скорость.'),
    words: [
      { word: 'string', say: T('A box for text.', 'Коробка для текста.') },
      { word: 'int', say: T('A box for a whole number: 100.', 'Коробка для целого числа: 100.') },
      { word: 'float', say: T('A box for a number with a point: 5.5f (the f is needed).', 'Коробка для дробного числа: 5.5f (буква f обязательна).') },
    ],
    hints: [T('Text in quotes, whole number without a point, fractional number with f at the end.', 'Текст в кавычках, целое число без точки, дробное — с f на конце.'), T('"Falcon", 100, 5.5f', '"Сокол", 100, 5.5f')],
    code: () => `using UnityEngine;

public class Soldier : MonoBehaviour
{
    public string callsign = ⟦${tr('"Falcon"', '"Сокол"')}⟧;
    public int health = ⟦100⟧;
    public float speed = ⟦5.5f⟧;

    void Start()
    {
        Debug.Log("${tr('Call sign: ', 'Позывной: ')}" + callsign);
        Debug.Log("${tr('Health: ', 'Здоровье: ')}" + health + "${tr(', speed: ', ', скорость: ')}" + speed);
    }
}
`,
    file: 'Soldier.cs',
    level: () => ({ id: 's02', ...SOFT, fog: 0.06, objects: [...room(16, { wall: '#d0d5db' })], player: { pos: [0, 0.9, 0] } }),
    goals: [
      { text: T('A call sign is set', 'Позывной записан'), check: (w) => typeof field(w, 'callsign') === 'string' && String(field(w, 'callsign')).trim().length > 0 },
      { text: T('Health is from 1 to 100', 'Здоровье от 1 до 100'), check: (w) => num(field(w, 'health')) >= 1 && num(field(w, 'health')) <= 100 },
      { text: T('Speed is more than 0', 'Скорость больше 0'), check: (w) => num(field(w, 'speed')) > 0 },
    ],
    keys: [],
    ability: T('The suit knows you: your call sign is on the screen.', 'Костюм тебя знает: позывной на экране.'),
    inUnity: T('Public variables appear in the Inspector: you can change them there without touching the code.', 'Публичные переменные появляются в Inspector: их можно менять там, не трогая код.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 0.2,
  },
  {
    id: 's03',
    chapter: 1,
    icon: '🦶',
    title: T('First step', 'Первый шаг'),
    system: T('Legs', 'Ноги'),
    radio: T('Lights are on. Now the legs: when W is held, move forward a little every frame. Walk to the yellow circle.', 'Свет есть. Теперь ноги: пока зажата W — каждый кадр сдвигайся чуть вперёд. Дойди до жёлтого круга.'),
    task: T('Fill 3 blanks, upload, click the game and hold W.', 'Заполни 3 пропуска, загрузи, нажми на игру и держи W.'),
    words: [
      { word: 'Update()', say: T('Runs every frame — about 60 times a second.', 'Срабатывает каждый кадр — примерно 60 раз в секунду.') },
      { word: 'if (…)', say: T('"If this is true — do what is in { }".', '«Если это правда — сделай то, что в { }».') },
      { word: 'Time.deltaTime', say: T('The time of one frame. Multiply by it so the speed is the same on any computer.', 'Время одного кадра. Умножай на него — и скорость будет одинаковой на любом компьютере.') },
    ],
    hints: [T('The key is W. The direction "forward" is Vector3.forward.', 'Клавиша — W. Направление «вперёд» — Vector3.forward.'), T('W, forward, Time.deltaTime', 'W, forward, Time.deltaTime')],
    code: () => `using UnityEngine;

public class PlayerMove : MonoBehaviour
{
    public float speed = 5f;

    void Update()
    {
        if (Input.GetKey(KeyCode.⟦W⟧))
        {
            transform.Translate(Vector3.⟦forward⟧ * speed * ⟦Time.deltaTime⟧);
        }
    }
}
`,
    file: 'PlayerMove.cs',
    level: () => ({ id: 's03', ...SOFT, fog: 0.04, objects: [...room(18, { wall: '#c9d0d8' }), zone('Goal', 0, 5)], player: { pos: [0, 0.9, -5] } }),
    goals: [{ text: T('Reach the yellow circle', 'Дойди до жёлтого круга'), check: (w, r) => sticky(r, 'g', inZone(w, 'Goal')) }],
    keys: ['W'],
    ability: T('Legs: W walks forward.', 'Ноги: W — идти вперёд.'),
    inUnity: T('Create a Capsule (3D Object → Capsule), put the script on it, press Play and hold W.', 'Создай Capsule (3D Object → Capsule), повесь на неё скрипт, нажми Play и держи W.'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 3,
  },
  {
    id: 's04',
    chapter: 1,
    icon: '🧭',
    title: T('All directions', 'Во все стороны'),
    system: T('Balance', 'Равновесие'),
    radio: T('Forward is not enough. Input.GetAxis gives a number from -1 to 1 for WASD at once. Visit all three circles.', 'Одного «вперёд» мало. Input.GetAxis сразу даёт число от -1 до 1 для WASD. Обойди все три круга.'),
    task: T('Fill the blanks, then walk with WASD into every circle.', 'Заполни пропуски и обойди на WASD все круги.'),
    words: [
      { word: 'Input.GetAxis("Horizontal")', say: T('A/D: -1 left, 1 right, 0 nothing.', 'A/D: -1 влево, 1 вправо, 0 — ничего.') },
      { word: 'Vector3', say: T('Three numbers (x, y, z): a direction or a point in 3D.', 'Три числа (x, y, z): направление или точка в 3D.') },
      { word: 'new', say: T('Make a new thing: new Vector3(x, 0, z).', 'Сделать новую вещь: new Vector3(x, 0, z).') },
    ],
    hints: [T('Left/right is "Horizontal", forward/back is "Vertical". In 3D, forward is z.', 'Влево/вправо — "Horizontal", вперёд/назад — "Vertical". В 3D вперёд — это z.'), T('"Horizontal", "Vertical", x, z', '"Horizontal", "Vertical", x, z')],
    code: () => `using UnityEngine;

public class PlayerMove : MonoBehaviour
{
    public float speed = 5f;

    void Update()
    {
        float x = Input.GetAxis(⟦"Horizontal"⟧);
        float z = Input.GetAxis(⟦"Vertical"⟧);
        Vector3 move = new Vector3(⟦x⟧, 0, ⟦z⟧);
        transform.Translate(move * speed * Time.deltaTime);
    }
}
`,
    file: 'PlayerMove.cs',
    level: () => ({ id: 's04', ...SOFT, fog: 0.03, objects: [...room(20, { wall: '#c4ccd6' }), zone('Left', -6, 0), zone('Right', 6, 0), zone('Back', 0, -6)], player: { pos: [0, 0.9, 0] } }),
    goals: [
      { text: T('Left circle', 'Левый круг'), check: (w, r) => sticky(r, 'l', inZone(w, 'Left')) },
      { text: T('Right circle', 'Правый круг'), check: (w, r) => sticky(r, 'r', inZone(w, 'Right')) },
      { text: T('Back circle', 'Круг сзади'), check: (w, r) => sticky(r, 'b', inZone(w, 'Back')) },
    ],
    keys: ['WASD'],
    ability: T('WASD: walk in any direction.', 'WASD — ходить в любую сторону.'),
    inUnity: T('Edit → Project Settings → Input Manager shows the axes "Horizontal" and "Vertical" (WASD and arrows).', 'Edit → Project Settings → Input Manager — там оси "Horizontal" и "Vertical" (WASD и стрелки).'),
    demo: (t) => ({ until: 1e9, keys: t < 1.35 ? ['a'] : t < 4 ? ['d'] : t < 5.3 ? ['a'] : ['s'] }),
    demoSeconds: 7,
  },
  {
    id: 's05',
    chapter: 1,
    icon: '👀',
    title: T('Eyes', 'Глаза'),
    system: T('Eyes: turning', 'Глаза: повороты'),
    radio: T('You walk, but you cannot turn your head. Mouse X is how much the mouse moved left-right. Turn the body by that much. Find three lamps around you.', 'Ходишь, а голову повернуть не можешь. Mouse X — насколько мышь сдвинулась влево-вправо. Поворачивай тело на столько же. Найди три лампы вокруг.'),
    task: T('Fill the blanks. Click the game: the mouse turns you. Look at every lamp.', 'Заполни пропуски. Нажми на игру: мышь поворачивает. Посмотри на каждую лампу.'),
    words: [
      { word: 'Input.GetAxis("Mouse X")', say: T('How far the mouse moved this frame (left −, right +).', 'Насколько мышь сдвинулась за кадр (влево −, вправо +).') },
      { word: 'transform.Rotate(0, y, 0)', say: T('Turn around the vertical axis by y degrees.', 'Повернуть вокруг вертикальной оси на y градусов.') },
    ],
    hints: [T('The axis is "Mouse X"; multiply it by mouseSensitivity; turn by mouseX.', 'Ось — "Mouse X"; умножь на mouseSensitivity; поворачивай на mouseX.'), T('"Mouse X", mouseSensitivity, mouseX', '"Mouse X", mouseSensitivity, mouseX')],
    code: () => `using UnityEngine;

public class PlayerMove : MonoBehaviour
{
    public float speed = 5f;
    public float mouseSensitivity = 2f;

    void Update()
    {
        float mouseX = Input.GetAxis(⟦"Mouse X"⟧) * ⟦mouseSensitivity⟧;
        transform.Rotate(0, ⟦mouseX⟧, 0);

        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        transform.Translate(new Vector3(x, 0, z) * speed * Time.deltaTime);
    }
}
`,
    file: 'PlayerMove.cs',
    level: () => ({ id: 's05', ...TRAINING, objects: [...room(20, { wall: '#c0c8d2' }), lamp('Lamp right', 7, 1.6, 0), lamp('Lamp behind', 0, 1.6, -7), lamp('Lamp left', -7, 1.6, 0)], player: { pos: [0, 0.9, 0] } }),
    goals: ['Lamp right', 'Lamp behind', 'Lamp left'].map((n, i) => ({
      text: [T('Lamp on the right', 'Лампа справа'), T('Lamp behind', 'Лампа сзади'), T('Lamp on the left', 'Лампа слева')][i],
      check: (w: World3D, r: MissionRun) => sticky(r, n, lookedAt(w, n)),
    })),
    keys: ['WASD', 'mouse'],
    ability: T('Eyes: the mouse turns you left and right.', 'Глаза: мышь поворачивает влево-вправо.'),
    inUnity: T('In Unity "Mouse X" works out of the box. The script stays on the player capsule.', 'В Unity "Mouse X" работает сразу. Скрипт остаётся на капсуле игрока.'),
    demo: (_t, w, r) => {
      const next = ['Lamp right', 'Lamp behind', 'Lamp left'].find((n) => r.mem[n] !== 1);
      const o = next && objByName(w, next);
      return o ? { until: 1e9, mouse: aimAt(w, o.pos).mouse } : { until: 1e9 };
    },
    demoSeconds: 6,
  },
  {
    id: 's06',
    chapter: 1,
    icon: '🙆',
    title: T('Look up', 'Взгляд вверх'),
    system: T('Eyes: up and down', 'Глаза: вверх-вниз'),
    radio: T('Now up and down. Careful: only the camera (the head) tilts, not the body. And a neck does not bend more than 80° — Mathf.Clamp keeps the number inside the limits.', 'Теперь вверх-вниз. Осторожно: наклоняется только камера (голова), не тело. И шея не гнётся больше 80° — Mathf.Clamp держит число в границах.'),
    task: T('Fill the blanks. Look at the lamp up on the wall and at the one on the floor.', 'Заполни пропуски. Посмотри на лампу высоко на стене и на лампу на полу.'),
    words: [
      { word: 'Mathf.Clamp(v, min, max)', say: T('Keeps v between min and max.', 'Держит v между min и max.') },
      { word: 'Quaternion.Euler(x, y, z)', say: T('A rotation from ordinary degrees.', 'Поворот из обычных градусов.') },
      { word: 'Cursor.lockState', say: T('Locked = the mouse cursor is hidden and stays in the game.', 'Locked = курсор спрятан и остаётся в игре.') },
    ],
    hints: [T('pitch -= mouseY (mouse up = look up). Limits: -80f and 80f.', 'pitch -= mouseY (мышь вверх = взгляд вверх). Границы: -80f и 80f.'), T('Locked, mouseY, -80f, 80f, pitch', 'Locked, mouseY, -80f, 80f, pitch')],
    code: () => `using UnityEngine;

public class MouseLook : MonoBehaviour
{
    public float sensitivity = 2f;
    public Transform cam;
    float pitch = 0f;

    void Start()
    {
        Cursor.lockState = CursorLockMode.⟦Locked⟧;
    }

    void Update()
    {
        float mouseX = Input.GetAxis("Mouse X") * sensitivity;
        float mouseY = Input.GetAxis("Mouse Y") * sensitivity;
        transform.Rotate(0, mouseX, 0);

        pitch -= ⟦mouseY⟧;
        pitch = Mathf.Clamp(pitch, ⟦-80f⟧, ⟦80f⟧);
        cam.localRotation = Quaternion.Euler(⟦pitch⟧, 0, 0);
    }
}
`,
    file: 'MouseLook.cs',
    level: () => ({
      id: 's06',
      ...TRAINING,
      objects: [...room(20, { wall: '#bcc5d0', height: 9 }), lamp('Lamp high', 0, 7.5, 5), lamp('Lamp floor', 0, 0.25, 2.5)],
      player: { pos: [0, 0.9, 0] },
      scripts: [{ source: MOVE_TRANSLATE, on: 'Player' }],
      autoInspector: true,
    }),
    goals: [
      { text: T('Lamp up high', 'Лампа наверху'), check: (w, r) => sticky(r, 'h', lookedAt(w, 'Lamp high', 8)) },
      { text: T('Lamp on the floor', 'Лампа на полу'), check: (w, r) => sticky(r, 'f', lookedAt(w, 'Lamp floor', 8)) },
      { text: T('The cursor is locked in the game', 'Курсор закреплён в игре'), check: (w) => w.cursorLocked },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Eyes: you look in every direction.', 'Глаза: смотришь во все стороны.'),
    inUnity: T('Make the Main Camera a child of the player capsule (drag it onto the capsule) and drag the camera into the "Cam" field in the Inspector.', 'Сделай Main Camera дочерней для капсулы игрока (перетащи её на капсулу) и перетащи камеру в поле «Cam» в Inspector.'),
    demo: (_t, w, r) => {
      const next = r.mem.h !== 1 ? 'Lamp high' : r.mem.f !== 1 ? 'Lamp floor' : null;
      const o = next && objByName(w, next);
      return o ? { until: 1e9, mouse: aimAt(w, o.pos).mouse } : { until: 1e9 };
    },
    demoSeconds: 5,
  },
  {
    id: 's07',
    chapter: 1,
    icon: '🧍',
    title: T('A real body', 'Настоящее тело'),
    system: T('Body', 'Тело'),
    radio: T('Translate moves you through walls like a ghost. A CharacterController is a real body: it stops at walls and climbs steps. Walk up the stairs to the platform.', 'Translate двигает сквозь стены, как призрака. CharacterController — настоящее тело: упирается в стены и шагает по ступенькам. Поднимись по лестнице на площадку.'),
    task: T('Fill the blanks and climb the stairs to the circle on the platform.', 'Заполни пропуски и поднимись по лестнице к кругу на площадке.'),
    words: [
      { word: 'GetComponent<T>()', say: T('"Give me the T part of this object".', '«Дай мне деталь T этого объекта».') },
      { word: 'CharacterController.Move', say: T('Move with collisions: walls stop you, steps are climbed.', 'Двигаться со столкновениями: стены держат, ступеньки — преодолеваются.') },
      { word: 'transform.forward / right', say: T('Where the player looks / the right side of the player — they turn with you.', 'Куда смотрит игрок / его правая сторона — поворачиваются вместе с тобой.') },
    ],
    hints: [T('GetComponent<CharacterController>(); right goes with x, forward with z; the method is Move.', 'GetComponent<CharacterController>(); right — с x, forward — с z; метод — Move.'), T('GetComponent<CharacterController>(), right, forward, Move', 'GetComponent<CharacterController>(), right, forward, Move')],
    code: () => `using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    public float speed = 5f;
    CharacterController controller;

    void Start()
    {
        controller = ⟦GetComponent<CharacterController>()⟧;
    }

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 move = transform.⟦right⟧ * x + transform.⟦forward⟧ * z;
        controller.⟦Move⟧(move * speed * Time.deltaTime);
    }
}
`,
    file: 'PlayerMovement.cs',
    level: () => ({
      id: 's07',
      ...TRAINING,
      objects: [
        ...room(22, { wall: '#b7c1cc' }),
        { name: 'Step', shape: 'box', pos: [0, 0.15, 2], size: [3, 0.3, 1], color: '#aab4c0' },
        { name: 'Step', shape: 'box', pos: [0, 0.3, 3], size: [3, 0.6, 1], color: '#a4aebb' },
        { name: 'Step', shape: 'box', pos: [0, 0.45, 4], size: [3, 0.9, 1], color: '#9ea9b6' },
        { name: 'Platform', shape: 'box', pos: [0, 0.6, 7], size: [6, 1.2, 5], color: '#98a3b1' },
        zone('Top', 0, 7.5, 1.1, 1.2),
      ],
      player: { pos: [0, 0.9, -4] },
      scripts: official('look'),
      autoInspector: true,
    }),
    goals: [{ text: T('Climb to the circle on the platform', 'Поднимись к кругу на площадке'), check: (w, r) => sticky(r, 't', inZone(w, 'Top')) }],
    keys: ['WASD', 'mouse'],
    ability: T('A body: walls stop you, steps are climbed.', 'Тело: стены держат, по ступенькам можно подняться.'),
    inUnity: T('Select the capsule → Add Component → Character Controller. Remove the Capsule Collider (the controller has its own).', 'Выдели капсулу → Add Component → Character Controller. Capsule Collider удали (у контроллера свой).'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 4,
  },
  {
    id: 's08',
    chapter: 1,
    icon: '🦘',
    title: T('Gravity', 'Гравитация'),
    system: T('Jump', 'Прыжок'),
    radio: T('Noticed? Step off an edge and you hang in the air. Let us add gravity: a speed downwards that grows every frame. And a jump: a push up, but only from the ground.', 'Заметил? Шагнёшь с края — повиснешь в воздухе. Добавим гравитацию: скорость вниз, которая растёт каждый кадр. И прыжок: толчок вверх, но только с земли.'),
    task: T('Fill the blanks and jump onto the crates to the circle.', 'Заполни пропуски и запрыгни на ящики к кругу.'),
    words: [
      { word: 'isGrounded', say: T('true when the body stands on something.', 'true, когда тело на чём-то стоит.') },
      { word: '&&', say: T('"and": both must be true.', '«и»: обе части должны быть правдой.') },
      { word: '+=', say: T('Add to what is already in the box.', 'Прибавить к тому, что уже в коробке.') },
    ],
    hints: [T('Jump only if controller.isGrounded. Every frame add gravity to velocityY. Move up by velocityY.', 'Прыгать — только если controller.isGrounded. Каждый кадр прибавляй gravity к velocityY. Двигай вверх на velocityY.'), T('controller.isGrounded, gravity, velocityY', 'controller.isGrounded, gravity, velocityY')],
    code: () => `using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    public float speed = 5f;
    public float gravity = -9.81f;
    public float jumpHeight = 1.5f;
    CharacterController controller;
    float velocityY;

    void Start()
    {
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 move = transform.right * x + transform.forward * z;
        controller.Move(move * speed * Time.deltaTime);

        if (controller.isGrounded && velocityY < 0)
            velocityY = -2f;

        if (Input.GetButtonDown("Jump") && ⟦controller.isGrounded⟧)
            velocityY = Mathf.Sqrt(jumpHeight * -2f * gravity);

        velocityY += ⟦gravity⟧ * Time.deltaTime;
        controller.Move(Vector3.up * ⟦velocityY⟧ * Time.deltaTime);
    }
}
`,
    file: 'PlayerMovement.cs',
    level: () => ({
      id: 's08',
      ...TRAINING,
      objects: [...room(22, { wall: '#b3bcc8' }), crate(0, 3, 2, 1.2), crate(0, 5.5, 2, 2.3), zone('Top', 0, 5.5, 0.9, 2.3)],
      player: { pos: [0, 0.9, -3] },
      scripts: official('look'),
      autoInspector: true,
    }),
    goals: [{ text: T('Jump up to the circle on the high crate', 'Запрыгни к кругу на высоком ящике'), check: (w, r) => sticky(r, 't', inZone(w, 'Top')) }],
    keys: ['WASD', 'mouse', 'Space'],
    ability: T('Jump: Space.', 'Прыжок: Пробел.'),
    inUnity: T('"Jump" is the Space key in the Input Manager. Real Unity uses the same formula: Mathf.Sqrt(height * -2 * gravity).', '"Jump" — это Пробел в Input Manager. В Unity та же формула: Mathf.Sqrt(высота * -2 * гравитация).'),
    demo: (t) => ({ until: 1e9, keys: Math.floor(t / 0.75) % 2 === 1 ? ['w', ' '] : ['w'] }),
    demoSeconds: 5,
  },
  {
    id: 's09',
    chapter: 1,
    icon: '🏃',
    title: T('Run and crawl', 'Бег и присед'),
    system: T('Sprint and crouch', 'Бег и присед'),
    radio: T('Last test of the body. Under the pipe — only crouched (C). Then sprint (Shift) to the finish in time. The ? : sign picks one of two values.', 'Последний тест тела. Под трубой — только пригнувшись (C). Потом рывок (Shift) до финиша на время. Знак ? : выбирает одно из двух значений.'),
    task: T('Fill the blanks. Crouch under the pipe, then run to the finish in 4.5 seconds.', 'Заполни пропуски. Пролезь под трубой, потом добеги до финиша за 4,5 секунды.'),
    words: [
      { word: 'a ? b : c', say: T('"If a — then b, otherwise c".', '«Если a — то b, иначе c».') },
      { word: 'bool', say: T('A box for yes/no (true/false).', 'Коробка для да/нет (true/false).') },
      { word: 'controller.height', say: T('The height of the body: 1.8 standing, 1 crouched.', 'Рост тела: 1.8 стоя, 1 пригнувшись.') },
    ],
    hints: [T('Run key: LeftShift. Running → runSpeed, otherwise walkSpeed. Crouched height 1f, standing 1.8f.', 'Клавиша бега — LeftShift. Бежишь → runSpeed, иначе walkSpeed. Рост пригнувшись 1f, стоя 1.8f.'), T('LeftShift, runSpeed, walkSpeed, 1f, 1.8f', 'LeftShift, runSpeed, walkSpeed, 1f, 1.8f')],
    code: () => `using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    public float walkSpeed = 5f;
    public float runSpeed = 9f;
    public float gravity = -9.81f;
    CharacterController controller;
    float velocityY;

    void Start()
    {
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        bool running = Input.GetKey(KeyCode.⟦LeftShift⟧);
        float speed = running ? ⟦runSpeed⟧ : ⟦walkSpeed⟧;

        if (Input.GetKey(KeyCode.C))
            controller.height = ⟦1f⟧;
        else
            controller.height = ⟦1.8f⟧;

        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 move = transform.right * x + transform.forward * z;
        controller.Move(move * speed * Time.deltaTime);

        if (controller.isGrounded && velocityY < 0) velocityY = -2f;
        velocityY += gravity * Time.deltaTime;
        controller.Move(Vector3.up * velocityY * Time.deltaTime);
    }
}
`,
    file: 'PlayerMovement.cs',
    level: () => ({
      id: 's09',
      ...TRAINING,
      objects: [
        wall(-2.2, 8, 0.4, 44, 3, '#b0bac6'),
        wall(2.2, 8, 0.4, 44, 3, '#b0bac6'),
        wall(0, -14, 4.8, 0.4, 3, '#b0bac6'),
        wall(0, 30, 4.8, 0.4, 3, '#b0bac6'),
        { name: 'Pipe', shape: 'box', pos: [0, 1.85, -4], size: [4, 1.3, 0.6], color: '#d08b4a' },
        zone('Under', 0, -2, 1.3),
        zone('Finish', 0, 24, 1.6),
      ],
      player: { pos: [0, 0.9, -10] },
      scripts: official('look'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Crawl under the pipe', 'Пролезь под трубой'), check: (w, r) => {
        const now = inZone(w, 'Under');
        if (now && !r.mem.under) r.mem.underAt = w.time;
        return sticky(r, 'under', now);
      } },
      { text: T('Reach the finish in 4.5 s after the pipe', 'Добеги до финиша за 4,5 с после трубы'), check: (w, r) => {
        if (r.mem.finish === 1) return true;
        if (!r.mem.under || !inZone(w, 'Finish')) return false;
        if (w.time - r.mem.underAt <= 4.5) return sticky(r, 'finish', true);
        const z = objByName(w, 'Finish');
        if (z) z.color = '#ffd166';
        r.mem.slow = 1;
        return false;
      } },
    ],
    keys: ['WASD', 'mouse', 'Shift', 'C'],
    ability: T('Sprint: Shift. Crouch: C.', 'Бег: Shift. Присесть: C.'),
    inUnity: T('Real games also move the camera down when crouching — here the engine does it for you (the camera follows the height).', 'В настоящих играх при приседе камеру тоже опускают — здесь движок делает это сам (камера следует за ростом).'),
    demo: (_t, w) => ({ until: 1e9, keys: w.player.pos.z < -1.4 ? ['w', 'c'] : ['w', 'Shift'] }),
    demoSeconds: 8,
  },
  // ===================================================================== chapter 2: shooting range
  {
    id: 's10',
    chapter: 2,
    icon: '🔦',
    title: T('The ray', 'Луч'),
    system: T('Weapon: aiming', 'Оружие: прицел'),
    radio: T('You got a weapon. A shot in games is an invisible ray from the eyes: Physics.Raycast. If it hit something — "out hit" tells what. Knock down three targets.', 'Тебе выдали оружие. Выстрел в играх — это невидимый луч из глаз: Physics.Raycast. Если попал — «out hit» расскажет, во что. Сбей три мишени.'),
    task: T('Fill the blanks. Left mouse button — shoot. Knock down all targets.', 'Заполни пропуски. Левая кнопка мыши — выстрел. Сбей все мишени.'),
    words: [
      { word: 'Physics.Raycast', say: T('Shoots a ray. true = hit something.', 'Пускает луч. true — во что-то попал.') },
      { word: 'out RaycastHit hit', say: T('A box the ray fills: what it hit, where, how far.', 'Коробка, которую луч заполнит: во что попал, где, как далеко.') },
      { word: 'CompareTag("Target")', say: T('Checks the tag of the object (a label like "Target").', 'Проверяет тег объекта (ярлык вроде "Target").') },
    ],
    hints: [T('Left button is 0. The ray goes where the camera looks: cam.forward. Destroy the hit object: hit.collider.gameObject.', 'Левая кнопка — 0. Луч летит туда, куда смотрит камера: cam.forward. Уничтожь объект попадания: hit.collider.gameObject.'), T('0, cam.forward, "Target", gameObject', '0, cam.forward, "Target", gameObject')],
    code: () => `using UnityEngine;

public class Gun : MonoBehaviour
{
    public Transform cam;
    public float range = 100f;

    void Update()
    {
        if (Input.GetMouseButtonDown(⟦0⟧))
        {
            if (Physics.Raycast(cam.position, ⟦cam.forward⟧, out RaycastHit hit, range))
            {
                Debug.Log("${tr('Hit: ', 'Попал в: ')}" + hit.collider.name);
                if (hit.collider.CompareTag(⟦"Target"⟧))
                    Destroy(hit.collider.⟦gameObject⟧);
            }
        }
    }
}
`,
    file: 'Gun.cs',
    level: () => ({
      id: 's10',
      ...RANGE,
      objects: [...room(30, { wall: '#c7bca9' }), target('Target 1', -3, 9), target('Target 2', 0, 13), target('Target 3', 3, 10), crate(-6, 6), crate(6, 7)],
      player: { pos: [0, 0.9, -4], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [{ text: T('Knock down all 3 targets', 'Сбей все 3 мишени'), check: (w) => aliveWith(w, 'Target').length === 0 }],
    keys: ['WASD', 'mouse', 'LMB'],
    ability: T('Weapon: the left mouse button shoots.', 'Оружие: левая кнопка мыши — выстрел.'),
    inUnity: T('Give the targets the tag "Target" (Inspector → Tag → Add Tag…). The ray only hits objects with a Collider.', 'Мишеням поставь тег "Target" (Inspector → Tag → Add Tag…). Луч попадает только в объекты с Collider.'),
    demo: (_t, w) => shootAll(w, 'Target'),
    demoSeconds: 8,
  },
  {
    id: 's11',
    chapter: 2,
    icon: '❤️‍🩹',
    title: T('Damage', 'Урон'),
    system: T('Weapon: damage', 'Оружие: урон'),
    radio: T('Steel targets have 100 health. Take their Health part and deal damage. A wall has no Health — GetComponent returns null, so check it.', 'У стальных мишеней 100 здоровья. Возьми у них деталь Health и нанеси урон. У стены Health нет — GetComponent вернёт null, поэтому проверяй.'),
    task: T('Fill the blanks and knock down the steel targets.', 'Заполни пропуски и сбей стальные мишени.'),
    words: [
      { word: 'null', say: T('"Nothing": the box is empty.', '«Ничего»: коробка пустая.') },
      { word: '!=', say: T('"is not equal to".', '«не равно».') },
      { word: 'TakeDamage(…)', say: T('A method of Health: take away health.', 'Метод Health: отнять здоровье.') },
    ],
    hints: [T('The part is called Health. "Not empty" is != null. Damage is the damage variable.', 'Деталь называется Health. «Не пустой» — это != null. Урон — переменная damage.'), T('Health, !=, damage', 'Health, !=, damage')],
    code: () => `using UnityEngine;

public class Gun : MonoBehaviour
{
    public Transform cam;
    public int damage = 34;

    void Update()
    {
        if (Input.GetMouseButtonDown(0))
        {
            if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, 100f))
            {
                Health health = hit.collider.GetComponent<⟦Health⟧>();
                if (health ⟦!=⟧ null)
                {
                    health.TakeDamage(⟦damage⟧);
                    Debug.Log("${tr('Health left: ', 'Осталось здоровья: ')}" + health.currentHealth);
                }
            }
        }
    }
}
`,
    file: 'Gun.cs',
    level: () => ({
      id: 's11',
      ...RANGE,
      objects: [...room(30, { wall: '#c4b8a3' }), target('Steel 1', -3, 10, 100, { color: '#8d99a6' }), target('Steel 2', 0, 14, 100, { color: '#8d99a6' }), target('Steel 3', 3, 11, 100, { color: '#8d99a6' }), crate(-6, 6), crate(6, 7)],
      player: { pos: [0, 0.9, -4], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [{ text: T('Knock down all steel targets', 'Сбей все стальные мишени'), check: (w) => aliveWith(w, 'Target').length === 0 }],
    keys: ['WASD', 'mouse', 'LMB'],
    ability: T('Damage: targets and enemies lose health.', 'Урон: мишени и враги теряют здоровье.'),
    inUnity: T('In Unity, Health would be your own small script with a TakeDamage method; here it is ready on targets and bots.', 'В Unity Health — это твой небольшой скрипт с методом TakeDamage; здесь он уже есть на мишенях и ботах.'),
    demo: (_t, w) => shootAll(w, 'Target'),
    demoSeconds: 10,
  },
  {
    id: 's12',
    chapter: 2,
    icon: '🔁',
    title: T('Magazine', 'Магазин'),
    system: T('Weapon: ammo', 'Оружие: патроны'),
    radio: T('Bullets are not endless: 6 in the magazine. The counter goes on the screen. Reload is a coroutine — a method that can wait: yield return new WaitForSeconds.', 'Патроны не бесконечные: 6 в магазине. Счётчик — на экран. Перезарядка — это корутина: метод, который умеет ждать: yield return new WaitForSeconds.'),
    task: T('Fill the blanks. Knock down the targets — you will have to reload (R).', 'Заполни пропуски. Сбей мишени — придётся перезаряжаться (R).'),
    words: [
      { word: 'ammo--', say: T('Take 1 away from ammo.', 'Отнять 1 от ammo.') },
      { word: 'IEnumerator', say: T('A method that can pause (a coroutine).', 'Метод, который умеет делать паузы (корутина).') },
      { word: 'StartCoroutine(…)', say: T('Start such a method.', 'Запустить такой метод.') },
    ],
    hints: [T('Start Reload(); one bullet less: --; wait 1.5f seconds; at the end reloading = false.', 'Запусти Reload(); на один патрон меньше: --; ждать 1.5f секунды; в конце reloading = false.'), T('Reload(), --, 1.5f, false', 'Reload(), --, 1.5f, false')],
    code: () => `using System.Collections;
using UnityEngine;
using TMPro;

public class Gun : MonoBehaviour
{
    public Transform cam;
    public TMP_Text ammoText;
    public int damage = 34;
    public int maxAmmo = 6;
    int ammo;
    bool reloading = false;

    void Start()
    {
        ammo = maxAmmo;
    }

    void Update()
    {
        ammoText.text = ammo + " / " + maxAmmo;
        if (reloading) return;

        if (Input.GetKeyDown(KeyCode.R) || ammo == 0)
        {
            StartCoroutine(⟦Reload()⟧);
            return;
        }
        if (Input.GetMouseButtonDown(0))
        {
            ammo⟦--⟧;
            Shoot();
        }
    }

    void Shoot()
    {
        if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, 100f))
        {
            Health health = hit.collider.GetComponent<Health>();
            if (health != null) health.TakeDamage(damage);
        }
    }

    IEnumerator Reload()
    {
        reloading = true;
        Debug.Log("${tr('Reloading...', 'Перезарядка...')}");
        yield return new WaitForSeconds(⟦1.5f⟧);
        ammo = maxAmmo;
        reloading = ⟦false⟧;
    }
}
`,
    file: 'Gun.cs',
    level: () => ({
      id: 's12',
      ...RANGE,
      objects: [...room(30, { wall: '#c1b49d' }), target('Steel 1', -3, 10, 100, { color: '#8d99a6' }), target('Steel 2', 0, 14, 100, { color: '#8d99a6' }), target('Steel 3', 3, 11, 100, { color: '#8d99a6' })],
      player: { pos: [0, 0.9, -4], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Reload at least once', 'Перезарядись хотя бы раз'), check: (w, r) => sticky(r, 'rl', logged(w, /reload|перезаряд/i)) },
      { text: T('Knock down all targets', 'Сбей все мишени'), check: (w) => aliveWith(w, 'Target').length === 0 },
    ],
    keys: ['WASD', 'mouse', 'LMB', 'R'],
    ability: T('Magazine and reload: R.', 'Магазин и перезарядка: R.'),
    inUnity: T('Create UI → Text - TextMeshPro and drag it into the "Ammo Text" field. Coroutines need "using System.Collections;".', 'Создай UI → Text - TextMeshPro и перетащи в поле «Ammo Text». Корутинам нужно «using System.Collections;».'),
    demo: (_t, w) => shootAll(w, 'Target'),
    demoSeconds: 14,
  },
  {
    id: 's13',
    chapter: 2,
    icon: '⚡',
    title: T('Automatic fire', 'Автоматический огонь'),
    system: T('Weapon: automatic', 'Оружие: автомат'),
    radio: T('Clicking every time is slow. Hold the button — fire on its own, but not faster than fireRate shots a second. A method can answer a question: bool CanShoot().', 'Щёлкать каждый раз — медленно. Держишь кнопку — стреляет само, но не чаще fireRate выстрелов в секунду. Метод может отвечать на вопрос: bool CanShoot().'),
    task: T('Fill the blanks. Knock down 4 targets within 5 seconds of the first shot.', 'Заполни пропуски. Сбей 4 мишени за 5 секунд после первого выстрела.'),
    words: [
      { word: 'GetMouseButton(0)', say: T('true all the time while the button is held.', 'true всё время, пока кнопка зажата.') },
      { word: 'Time.time', say: T('Seconds since the game started.', 'Секунды с начала игры.') },
      { word: 'return', say: T('The answer of a method.', 'Ответ метода.') },
    ],
    hints: [T('Ask CanShoot(). Next shot: Time.time + 1f / fireRate. You can shoot when Time.time >= nextFireTime.', 'Спроси CanShoot(). Следующий выстрел: Time.time + 1f / fireRate. Стрелять можно, когда Time.time >= nextFireTime.'), T('CanShoot(), fireRate, nextFireTime', 'CanShoot(), fireRate, nextFireTime')],
    code: () => `using UnityEngine;
using TMPro;

public class Gun : MonoBehaviour
{
    public Transform cam;
    public TMP_Text ammoText;
    public int damage = 20;
    public int ammo = 40;
    public float fireRate = 8f;
    float nextFireTime = 0f;

    void Update()
    {
        ammoText.text = ammo.ToString();
        if (Input.GetMouseButton(0) && ⟦CanShoot()⟧)
        {
            nextFireTime = Time.time + 1f / ⟦fireRate⟧;
            ammo--;
            Shoot();
        }
    }

    bool CanShoot()
    {
        return ammo > 0 && Time.time >= ⟦nextFireTime⟧;
    }

    void Shoot()
    {
        if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, 100f))
        {
            Health health = hit.collider.GetComponent<Health>();
            if (health != null) health.TakeDamage(damage);
        }
    }
}
`,
    file: 'Gun.cs',
    level: () => ({
      id: 's13',
      ...RANGE,
      objects: [...room(30, { wall: '#bfb199' }), target('T1', -4, 9, 60), target('T2', -1.5, 12, 60), target('T3', 1.5, 12, 60), target('T4', 4, 9, 60)],
      player: { pos: [0, 0.9, -3], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Knock down all 4 targets', 'Сбей все 4 мишени'), check: (w) => aliveWith(w, 'Target').length === 0 },
      { text: T('…within 5 seconds of the first shot', '…за 5 секунд после первого выстрела'), check: (w, r) => {
        if (r.mem.first === undefined && w.shots.some((s) => !s.byBot)) r.mem.first = w.time;
        if (r.mem.fast === 1) return true;
        if (aliveWith(w, 'Target').length === 0 && r.mem.first !== undefined) return sticky(r, 'fast', w.time - r.mem.first <= 5);
        return false;
      } },
    ],
    keys: ['WASD', 'mouse', 'LMB (hold)'],
    ability: T('Automatic: hold the button.', 'Автомат: держи кнопку.'),
    inUnity: T('Exactly the same code works in Unity. Try fireRate = 3 and fireRate = 15 to feel the difference.', 'Точно такой же код работает в Unity. Попробуй fireRate = 3 и fireRate = 15 — почувствуй разницу.'),
    demo: (_t, w) => shootAll(w, 'Target', true),
    demoSeconds: 8,
  },
  {
    id: 's14',
    chapter: 2,
    icon: '💥',
    title: T('Shotgun', 'Дробовик'),
    system: T('Weapon: shotgun', 'Оружие: дробовик'),
    radio: T('Armoured targets heal right after a hit — kill them in ONE shot. A shotgun fires several pellets at once: a for loop repeats the ray, Random.Range scatters it.', 'Бронированные мишени сразу лечатся после попадания — бей ОДНИМ выстрелом. Дробовик стреляет несколькими дробинами сразу: цикл for повторяет луч, Random.Range разбрасывает его.'),
    task: T('Fill the blanks and knock down the armoured targets with one shot each.', 'Заполни пропуски и сбей бронированные мишени — каждую одним выстрелом.'),
    words: [
      { word: 'for (int i = 0; i < n; i++)', say: T('Repeat n times: i = 0, 1, 2 … n-1.', 'Повторить n раз: i = 0, 1, 2 … n-1.') },
      { word: 'Random.Range(a, b)', say: T('A random number between a and b.', 'Случайное число между a и b.') },
      { word: 'i++', say: T('Add 1 to i.', 'Прибавить 1 к i.') },
    ],
    hints: [T('Repeat pellets times, i++. The ray goes in direction dir.', 'Повторить pellets раз, i++. Луч идёт в направлении dir.'), T('pellets, ++, dir', 'pellets, ++, dir')],
    code: () => `using UnityEngine;

public class Shotgun : MonoBehaviour
{
    public Transform cam;
    public int pellets = 6;
    public int damage = 25;
    public float spread = 0.04f;

    void Update()
    {
        if (Input.GetMouseButtonDown(0))
            Shoot();
    }

    void Shoot()
    {
        for (int i = 0; i < ⟦pellets⟧; i⟦++⟧)
        {
            Vector3 dir = cam.forward;
            dir.x += Random.Range(-spread, spread);
            dir.y += Random.Range(-spread, spread);
            if (Physics.Raycast(cam.position, ⟦dir⟧, out RaycastHit hit, 40f))
            {
                Health health = hit.collider.GetComponent<Health>();
                if (health != null) health.TakeDamage(damage);
            }
        }
    }
}
`,
    file: 'Shotgun.cs',
    level: () => ({
      id: 's14',
      ...RANGE,
      objects: [...room(30, { wall: '#bcae95' }), target('Armour 1', -3, 4, 120, { color: '#5f6b78', regen: 0.05 }), target('Armour 2', 0, 5, 120, { color: '#5f6b78', regen: 0.05 }), target('Armour 3', 3, 4, 120, { color: '#5f6b78', regen: 0.05 })],
      player: { pos: [0, 0.9, -1], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [{ text: T('Knock down 3 armoured targets', 'Сбей 3 бронированные мишени'), check: (w) => aliveWith(w, 'Target').length === 0 }],
    keys: ['WASD', 'mouse', 'LMB'],
    ability: T('Shotgun: many pellets at once.', 'Дробовик: много дробин за раз.'),
    inUnity: T('In Unity add Debug.DrawRay(cam.position, dir * 40f, Color.red, 1f) inside the loop to see the pellets in the Scene window.', 'В Unity добавь в цикл Debug.DrawRay(cam.position, dir * 40f, Color.red, 1f) — увидишь дробины в окне Scene.'),
    demo: (_t, w) => shootAll(w, 'Target'),
    demoSeconds: 8,
  },
  {
    id: 's15',
    chapter: 2,
    icon: '🗃',
    title: T('Arsenal', 'Арсенал'),
    system: T('Weapon: arsenal', 'Оружие: арсенал'),
    radio: T('Two weapons: a rifle for close targets and a sniper rifle for the far armoured one. A class is a blueprint: describe a Weapon once, make as many as you want with new. Keys 1 and 2 switch.', 'Два ствола: автомат для ближних мишеней и снайперка для дальней бронированной. Класс — это чертёж: описал Weapon один раз — делаешь сколько хочешь через new. Клавиши 1 и 2 переключают.'),
    task: T('Fill the blanks. Knock down everything: the far one only with the sniper rifle (2).', 'Заполни пропуски. Сбей всё: дальнюю — только снайперкой (2).'),
    words: [
      { word: 'class Weapon', say: T('A blueprint of a weapon: name, damage, rate of fire.', 'Чертёж оружия: имя, урон, скорострельность.') },
      { word: 'constructor', say: T('A method with the class name: fills a new object.', 'Метод с именем класса: заполняет новый объект.') },
      { word: 'List<Weapon>', say: T('A list of weapons; weapons[0] is the first one.', 'Список оружия; weapons[0] — первое.') },
    ],
    hints: [T('this.damage = damage. A new object needs new. Numbers in a list start from 0.', 'this.damage = damage. Новый объект — через new. Номера в списке — с 0.'), T('damage, new, 0, 1, name', 'damage, new, 0, 1, name')],
    code: () => `using System.Collections.Generic;
using UnityEngine;
using TMPro;

public class Weapon
{
    public string name;
    public int damage;
    public float fireRate;

    public Weapon(string name, int damage, float fireRate)
    {
        this.name = name;
        this.damage = ⟦damage⟧;
        this.fireRate = fireRate;
    }
}

public class Arsenal : MonoBehaviour
{
    public Transform cam;
    public TMP_Text weaponText;
    List<Weapon> weapons = new List<Weapon>();
    Weapon current;
    float nextFireTime;

    void Start()
    {
        weapons.Add(new Weapon("${tr('Rifle', 'Автомат')}", 20, 10f));
        weapons.Add(⟦new⟧ Weapon("${tr('Sniper', 'Снайперка')}", 120, 1f));
        current = weapons[⟦0⟧];
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Alpha1)) current = weapons[0];
        if (Input.GetKeyDown(KeyCode.Alpha2)) current = weapons[⟦1⟧];
        weaponText.text = current.⟦name⟧;

        if (Input.GetMouseButton(0) && Time.time >= nextFireTime)
        {
            nextFireTime = Time.time + 1f / current.fireRate;
            if (Physics.Raycast(cam.position, cam.forward, out RaycastHit hit, 200f))
            {
                Health health = hit.collider.GetComponent<Health>();
                if (health != null) health.TakeDamage(current.damage);
            }
        }
    }
}
`,
    file: 'Arsenal.cs',
    level: () => ({
      id: 's15',
      ...RANGE,
      objects: [...room(70, { wall: '#bba98c' }), target('Near 1', -3, 6, 60), target('Near 2', 3, 7, 60), { ...target('Far armour', 0, 30, 110, { color: '#5f6b78', armor: 60 }), size: [1.4, 1.4, 0.15] }],
      player: { pos: [0, 0.9, -2], gun: true },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Knock down the near targets', 'Сбей ближние мишени'), check: (w) => !objByName(w, 'Near 1')?.alive && !objByName(w, 'Near 2')?.alive },
      { text: T('Knock down the far armoured target', 'Сбей дальнюю бронированную'), check: (w) => objByName(w, 'Far armour')?.alive === false },
    ],
    keys: ['WASD', 'mouse', 'LMB', '1', '2'],
    ability: T('Arsenal: 1 — rifle, 2 — sniper rifle.', 'Арсенал: 1 — автомат, 2 — снайперка.'),
    inUnity: T('A class without ": MonoBehaviour" is not put on objects — it is just a blueprint you use from scripts.', 'Класс без «: MonoBehaviour» на объекты не вешают — это просто чертёж, им пользуются из скриптов.'),
    demo: (_t, w) => {
      const near = w.objects.some((o) => o.alive && /^Near/.test(o.name));
      return near ? shootAll(w, (o) => /^Near/.test(o.name), true, ['1']) : { ...shootAll(w, 'Target', false, w.frameNo % 30 < 2 ? ['2'] : []) };
    },
    demoSeconds: 12,
  },
  // ============================================================================ chapter 3: enemy
  {
    id: 's16',
    chapter: 3,
    icon: '🚶',
    title: T('Patrol', 'Патруль'),
    system: T('Bots: legs', 'Боты: ноги'),
    radio: T('Now you write the enemy. This script lives on the bot: it walks from point to point in a circle. An array is a numbered row of boxes; % starts again from 0.', 'Теперь ты пишешь врага. Этот скрипт живёт на боте: он ходит от точки к точке по кругу. Массив — пронумерованный ряд коробок; % начинает снова с 0.'),
    task: T('Fill the blanks. The bot must visit all 3 points.', 'Заполни пропуски. Бот должен обойти все 3 точки.'),
    words: [
      { word: 'Vector3[] points', say: T('An array: several points in a row, points[0], points[1]…', 'Массив: несколько точек подряд, points[0], points[1]…') },
      { word: 'Vector3.MoveTowards', say: T('Step towards a point, not further than the step.', 'Шаг к точке, но не дальше шага.') },
      { word: '%', say: T('Remainder: (2 + 1) % 3 = 0 — back to the beginning.', 'Остаток: (2 + 1) % 3 = 0 — снова к началу.') },
    ],
    hints: [T('Take the point by its number index. Go to target. Close enough: less than 0.1f. The array length: Length.', 'Бери точку по номеру index. Иди к target. Достаточно близко — меньше 0.1f. Длина массива — Length.'), T('index, target, 0.1f, Length', 'index, target, 0.1f, Length')],
    code: () => `using UnityEngine;

public class EnemyPatrol : MonoBehaviour
{
    public float speed = 2.5f;
    Vector3[] points = new Vector3[] { new Vector3(-6, 0.9f, 8), new Vector3(6, 0.9f, 8), new Vector3(0, 0.9f, 14) };
    int index = 0;

    void Update()
    {
        Vector3 target = points[⟦index⟧];
        transform.position = Vector3.MoveTowards(transform.position, ⟦target⟧, speed * Time.deltaTime);
        transform.LookAt(target);

        if (Vector3.Distance(transform.position, target) < ⟦0.1f⟧)
        {
            index = (index + 1) % points.⟦Length⟧;
        }
    }
}
`,
    file: 'EnemyPatrol.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 's16',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#bfa983' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 11], bot: { sight: 0 } }, ...[[-6, 8], [6, 8], [0, 14]].map(([x, z], i) => zone(`Point ${i + 1}`, x, z, 0.6))],
      player: { pos: [0, 0.9, -4] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [1, 2, 3].map((i) => ({
      text: T(`The bot visited point ${i}`, `Бот дошёл до точки ${i}`),
      check: (w: World3D, r: MissionRun) => {
        const bot = objByName(w, 'Bot');
        const z = objByName(w, `Point ${i}`);
        if (!bot || !z) return false;
        const ok = Math.hypot(bot.pos.x - z.pos.x, bot.pos.z - z.pos.z) < 0.4;
        if (ok) z.color = '#3ad17a';
        return sticky(r, `p${i}`, ok);
      },
    })),
    keys: ['WASD', 'mouse', 'LMB'],
    ability: T('You can make bots walk.', 'Ты умеешь заставить бота ходить.'),
    inUnity: T('Real projects often use empty objects as points (public Transform[] points) and drag them in the Inspector; NavMeshAgent walks around walls by itself.', 'В настоящих проектах точками часто делают пустые объекты (public Transform[] points) и перетаскивают их в Inspector; NavMeshAgent сам обходит стены.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 14,
  },
  {
    id: 's17',
    chapter: 3,
    icon: '👁',
    title: T('The eyes of a bot', 'Глаза бота'),
    system: T('Bots: eyes', 'Боты: зрение'),
    radio: T('A bot that sees through the back of its head is boring. Give it a field of view: not further than viewDistance and not wider than viewAngle. First sneak up behind it, then show yourself in front.', 'Бот, который видит затылком, — скучный. Дай ему поле зрения: не дальше viewDistance и не шире viewAngle. Сначала подкрадись к нему сзади, потом покажись спереди.'),
    task: T('Fill the blanks. Sneak up behind (3 m) unnoticed, then walk in front of it: it must turn to you.', 'Заполни пропуски. Подкрадись сзади (3 м) незамеченным, потом выйди перед ним: он должен повернуться к тебе.'),
    words: [
      { word: 'magnitude', say: T('The length of a vector = the distance.', 'Длина вектора = расстояние.') },
      { word: 'Vector3.Angle(a, b)', say: T('The angle between two directions, in degrees.', 'Угол между двумя направлениями, в градусах.') },
      { word: 'bool CanSeePlayer()', say: T('A method that answers yes or no.', 'Метод, который отвечает «да» или «нет».') },
    ],
    hints: [T('Look at player. Further than viewDistance — false. Wider than viewAngle — false.', 'Смотри на player. Дальше viewDistance — false. Шире viewAngle — false.'), T('player, viewDistance, viewAngle, false', 'player, viewDistance, viewAngle, false')],
    code: () => `using UnityEngine;

public class EnemyEyes : MonoBehaviour
{
    public Transform player;
    public float viewDistance = 12f;
    public float viewAngle = 60f;

    void Update()
    {
        if (CanSeePlayer())
            transform.LookAt(⟦player⟧);
    }

    bool CanSeePlayer()
    {
        Vector3 toPlayer = player.position - transform.position;
        if (toPlayer.magnitude > ⟦viewDistance⟧) return false;
        if (Vector3.Angle(transform.forward, toPlayer) > ⟦viewAngle⟧) return ⟦false⟧;
        return true;
    }
}
`,
    file: 'EnemyEyes.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 's17',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#bca57e' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 8], bot: { sight: 0 } }, zone('Behind', 0, 5.2, 0.8), zone('Front', 0, 13, 1)],
      player: { pos: [0, 0.9, -4] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Sneak up behind it (3 m) unnoticed', 'Подкрадись сзади (3 м) незамеченным'), check: (w, r) => {
        const bot = objByName(w, 'Bot');
        if (!bot) return false;
        const f = qRotate(bot.rot, v3(0, 0, 1));
        if (f.z < 0.9) r.mem.noticed = 1;
        return sticky(r, 'sneak', !r.mem.noticed && inZone(w, 'Behind'));
      } },
      { text: T('Walk in front of it — it turns to you', 'Выйди перед ним — он повернётся к тебе'), check: (w, r) => {
        const bot = objByName(w, 'Bot');
        if (!bot || !r.mem.sneak) return false;
        const f = qRotate(bot.rot, v3(0, 0, 1));
        const to = v3(w.player.pos.x - bot.pos.x, 0, w.player.pos.z - bot.pos.z);
        const l = Math.hypot(to.x, to.z) || 1;
        return sticky(r, 'seen', inZone(w, 'Front') && (f.x * to.x + f.z * to.z) / l > 0.97);
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Bots see only in front of them — you can sneak up.', 'Боты видят только перед собой — можно подкрасться.'),
    inUnity: T('Add a Physics.Raycast from the bot to the player: then it also does not see through walls (the built-in bots here do it).', 'Добавь Physics.Raycast от бота к игроку — тогда он не будет видеть сквозь стены (встроенные боты здесь так и делают).'),
    demo: (_t, w, r) => (!r.mem.sneak ? walkTo(w, v3(0, 0, 5.2)) : w.player.pos.z < 9.5 ? walkTo(w, v3(3, 0, 10)) : walkTo(w, v3(0, 0, 13))),
    demoSeconds: 12,
  },
  {
    id: 's18',
    chapter: 3,
    icon: '🧠',
    title: T('The brain of a bot', 'Мозг бота'),
    system: T('Bots: brain', 'Боты: мозг'),
    radio: T('A brain is a list of states: Patrol or Attack. enum gives them names, switch picks what to do. The bot shoots training rounds: let it notice you, then run away.', 'Мозг — это список состояний: Патруль или Атака. enum даёт им имена, switch выбирает, что делать. Бот стреляет учебными пулями: дай ему заметить тебя, потом убеги.'),
    task: T('Fill the blanks. Walk close: the bot attacks and hits you. Run far away: it calms down.', 'Заполни пропуски. Подойди близко: бот атакует и попадает. Убеги далеко: он успокоится.'),
    words: [
      { word: 'enum State { Patrol, Attack }', say: T('A list of named options.', 'Список вариантов с именами.') },
      { word: 'switch / case', say: T('"Depending on state: in case Patrol do this, in case Attack — that".', '«Смотря какое состояние: если Patrol — это, если Attack — то».') },
      { word: 'break', say: T('End of this case.', 'Конец этого варианта.') },
    ],
    hints: [T('Close → State.Attack. Pause between shots: fireRate. Far → State.Patrol. Tag of the player: "Player".', 'Близко → State.Attack. Пауза между выстрелами — fireRate. Далеко → State.Patrol. Тег игрока — "Player".'), T('Attack, fireRate, Patrol, "Player", 5', 'Attack, fireRate, Patrol, "Player", 5')],
    code: () => `using UnityEngine;

public class EnemyAI : MonoBehaviour
{
    public enum State { Patrol, Attack }
    public State state = State.Patrol;
    public Transform player;
    public float fireRate = 0.8f;
    float nextShot;

    void Update()
    {
        float distance = Vector3.Distance(transform.position, player.position);

        switch (state)
        {
            case State.Patrol:
                transform.Rotate(0, 40f * Time.deltaTime, 0);
                if (distance < 10f) state = State.⟦Attack⟧;
                break;

            case State.Attack:
                transform.LookAt(player);
                if (Time.time >= nextShot)
                {
                    nextShot = Time.time + ⟦fireRate⟧;
                    Shoot();
                }
                if (distance > 16f) state = State.⟦Patrol⟧;
                break;
        }
    }

    void Shoot()
    {
        Vector3 eye = transform.position + Vector3.up * 0.7f;
        Vector3 dir = player.position - eye;
        if (Physics.Raycast(eye, dir, out RaycastHit hit, 50f))
        {
            if (hit.collider.CompareTag(⟦"Player"⟧))
                hit.collider.GetComponent<Health>().TakeDamage(⟦5⟧);
        }
    }
}
`,
    file: 'EnemyAI.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 's18',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(44, { wall: '#b9a27a' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 10], bot: { sight: 0 } }, crate(-4, 4), crate(4, 2)],
      player: { pos: [0, 0.9, -8] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The bot attacks you', 'Бот перешёл в атаку'), check: (w, r) => sticky(r, 'att', String((field(w, 'state') as { name?: string } | undefined)?.name) === 'Attack') },
      { text: T('…and hits you', '…и попал в тебя'), check: (w, r) => sticky(r, 'hit', (w.player.health?.value ?? 100) < (w.player.health?.max ?? 100)) },
      { text: T('Run away: it calms down (Patrol)', 'Убеги: он успокоится (Patrol)'), check: (w, r) => r.mem.hit === 1 && sticky(r, 'calm', String((field(w, 'state') as { name?: string } | undefined)?.name) === 'Patrol') },
    ],
    keys: ['WASD', 'mouse', 'Shift'],
    ability: T('Bots think: patrol, attack, calm down.', 'Боты думают: патруль, атака, успокоиться.'),
    inUnity: T('This is a "state machine" — almost every game AI is built like this. Real bots add Chase, Search, Cover…', 'Это «машина состояний» — так устроен почти любой игровой ИИ. В настоящих ботах добавляют Chase, Search, Cover…'),
    demo: (_t, w, r) => (r.mem.hit === 1 ? walkTo(w, v3(0, 0, -19), ['Shift']) : walkTo(w, v3(0, 0, 3))),
    demoSeconds: 14,
  },
  // ===================================================================== chapter 4: living bots
  {
    id: 'b1',
    chapter: 4,
    icon: '🎥',
    title: T('The spectator', 'Наблюдатель'),
    system: T('Camera: spectator', 'Камера: наблюдатель'),
    radio: T('Before fixing bots you must SEE them. When you are out of a round, games put the camera behind a bot. Write that camera: it follows the bot smoothly and always looks at it.', 'Чтобы чинить ботов, их надо ВИДЕТЬ. Когда ты выбыл из раунда, игры ставят камеру за спину бота. Напиши такую камеру: она плавно летит за ботом и всегда на него смотрит.'),
    task: T('Fill the blanks. The camera must keep the walking bot in view for 4 seconds, from behind.', 'Заполни пропуски. Камера должна 4 секунды держать идущего бота в кадре, со спины.'),
    words: [
      { word: 'LateUpdate()', say: T('Runs after everybody moved — the right moment for cameras.', 'Срабатывает после того, как все подвинулись, — правильное время для камер.') },
      { word: 'bot.rotation * offset', say: T('"Behind and above the bot" turned the way the bot is turned.', '«Сзади и сверху от бота» с учётом того, куда бот повёрнут.') },
      { word: 'Vector3.Lerp', say: T('Fly a part of the way each frame — smooth, no jerks.', 'Каждый кадр пролететь часть пути — плавно, без рывков.') },
    ],
    hints: [T('wanted = bot.position + bot.rotation * offset; move with Lerp; look at the bot.', 'wanted = bot.position + bot.rotation * offset; двигайся через Lerp; смотри на бота.'), T('offset, Lerp, bot', 'offset, Lerp, bot')],
    code: () => `using UnityEngine;

public class BotCamera : MonoBehaviour
{
    public Transform bot;
    public Vector3 offset = new Vector3(0, 2.5f, -4.5f);
    public float smooth = 4f;

    void LateUpdate()
    {
        Vector3 wanted = bot.position + bot.rotation * ⟦offset⟧;
        transform.position = Vector3.⟦Lerp⟧(transform.position, wanted, smooth * Time.deltaTime);
        transform.LookAt(⟦bot⟧.position + Vector3.up);
    }
}
`,
    file: 'BotCamera.cs',
    attachTo: 'Main Camera',
    level: () => ({
      id: 'b1',
      ...DUSK,
      objects: [...room(34, { wall: '#bca57e' }), crate(-5, 4), crate(6, 9), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [-6, 0.9, 2], bot: { sight: 0, speed: 3, waypoints: [[-6, 0.9, 2], [6, 0.9, 2], [6, 0.9, 12], [-6, 0.9, 12]] } }],
      player: { pos: [0, 0.9, -10] },
      autoInspector: true,
    }),
    goals: [
      { text: T('The bot stays in view for 4 seconds', 'Бот в кадре 4 секунды подряд'), check: (w, r) => {
        const bot = objByName(w, 'Bot');
        if (!bot) return false;
        const ok = angleTo(w, add3(bot.pos, 0.5)) < 18;
        r.mem.inView = ok ? (r.mem.inView ?? 0) + w.dt : 0;
        return sticky(r, 'view', r.mem.inView >= 4);
      } },
      { text: T('…from behind, 3–7 m away', '…со спины, в 3–7 м'), check: (w, r) => {
        const bot = objByName(w, 'Bot');
        if (!bot) return false;
        const d = { x: w.camera.pos.x - bot.pos.x, z: w.camera.pos.z - bot.pos.z };
        const dist = Math.hypot(d.x, d.z);
        const f = qRotate(bot.rot, v3(0, 0, 1));
        return sticky(r, 'behind', dist > 3 && dist < 7 && f.x * d.x + f.z * d.z < 0);
      } },
    ],
    keys: [],
    ability: T('You can watch bots from behind — the spectator camera of every shooter.', 'Ты умеешь смотреть за ботами со спины — камера наблюдателя любого шутера.'),
    inUnity: T('Put the script on the Main Camera (not inside the player) and drag the bot into "Bot". Cinemachine does the same with a "Follow" target.', 'Повесь скрипт на Main Camera (не внутри игрока) и перетащи бота в поле «Bot». Cinemachine делает то же самое через цель «Follow».'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 9,
  },
  {
    id: 'b2',
    chapter: 4,
    icon: '🔄',
    title: T('A smooth turn', 'Плавный поворот'),
    system: T('Bots: neck', 'Боты: шея'),
    radio: T('A robot snaps to you in one frame — that is why bots look fake. A person turns with a limited speed. Quaternion.RotateTowards turns by at most N degrees per step.', 'Робот разворачивается к тебе за один кадр — поэтому боты выглядят ненастоящими. Человек поворачивается с ограниченной скоростью. Quaternion.RotateTowards поворачивает не больше чем на N градусов за шаг.'),
    task: T('Fill the blanks. The bot must turn to you — but never faster than 200° per second.', 'Заполни пропуски. Бот должен повернуться к тебе — но не быстрее 200° в секунду.'),
    words: [
      { word: 'Quaternion.LookRotation(dir)', say: T('The rotation that looks in this direction.', 'Поворот, который смотрит в это направление.') },
      { word: 'Quaternion.RotateTowards(a, b, max)', say: T('From a towards b, but at most max degrees.', 'От a к b, но не больше чем на max градусов.') },
    ],
    hints: [T('want = LookRotation(toPlayer); turn with RotateTowards by turnSpeed * Time.deltaTime.', 'want = LookRotation(toPlayer); поворачивай через RotateTowards на turnSpeed * Time.deltaTime.'), T('LookRotation, RotateTowards, turnSpeed', 'LookRotation, RotateTowards, turnSpeed')],
    code: () => `using UnityEngine;

public class BotTurn : MonoBehaviour
{
    public Transform player;
    public float turnSpeed = 180f;

    void Update()
    {
        Vector3 toPlayer = player.position - transform.position;
        toPlayer.y = 0;
        Quaternion want = Quaternion.⟦LookRotation⟧(toPlayer);
        transform.rotation = Quaternion.⟦RotateTowards⟧(transform.rotation, want, ⟦turnSpeed⟧ * Time.deltaTime);
    }
}
`,
    file: 'BotTurn.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b2',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#b9a27a' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 6], bot: { sight: 0 } }],
      player: { pos: [0, 0.9, 0] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The bot turned to you', 'Бот повернулся к тебе'), check: (w, r) => sticky(r, 'face', faces(w, 'Bot', 8)) },
      { text: T('…smoothly: never faster than 200°/s', '…плавно: не быстрее 200°/с'), check: (w, r) => {
        trackYawRate(w, r, 'Bot');
        return r.mem.face === 1 && (r.mem.maxRate ?? 0) <= 205;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Your bots turn like people, not like turrets.', 'Твои боты поворачиваются как люди, а не как турели.'),
    inUnity: T('The same line is used for turrets, heads, cars turning to a target. turnSpeed 90 — slow guard, 400 — fast fighter.', 'Эту же строку используют для турелей, голов, машин, поворачивающих к цели. turnSpeed 90 — медленный охранник, 400 — быстрый боец.'),
    demo: (t) => ({ until: 1e9, keys: t > 1.5 && t < 2.6 ? ['a'] : [] }),
    demoSeconds: 4,
  },
  {
    id: 'b3',
    chapter: 4,
    icon: '⏱',
    title: T('Reaction time', 'Время реакции'),
    system: T('Bots: reaction', 'Боты: реакция'),
    radio: T('A person who sees you needs a moment to understand and react — about 0.3–0.6 seconds. A bot that fires in the very first frame feels like a cheater. Count how long it has seen you.', 'Человеку, который тебя увидел, нужно мгновение, чтобы понять и среагировать, — около 0,3–0,6 секунды. Бот, стреляющий в первый же кадр, ощущается как читер. Считай, сколько он тебя уже видит.'),
    task: T('Fill the blanks, then step out from behind the wall: the bot fires — but not at once.', 'Заполни пропуски и выйди из-за стены: бот выстрелит — но не сразу.'),
    words: [
      { word: 'seenFor += Time.deltaTime', say: T('A stopwatch: grows while the bot sees you.', 'Секундомер: растёт, пока бот тебя видит.') },
      { word: 'seenFor = 0', say: T('Lost you — the stopwatch starts again.', 'Потерял тебя — секундомер сначала.') },
    ],
    hints: [T('Add Time.deltaTime; shoot when seenFor > reactionTime; otherwise put 0.', 'Прибавляй Time.deltaTime; стреляй, когда seenFor > reactionTime; иначе клади 0.'), T('Time.deltaTime, reactionTime, 0', 'Time.deltaTime, reactionTime, 0')],
    code: () => `using UnityEngine;

public class BotReact : MonoBehaviour
{
    public Transform player;
    public float reactionTime = 0.5f;
    public float viewDistance = 25f;
    float seenFor;
    float nextShot;

    void Update()
    {
        if (CanSee())
        {
            seenFor += ⟦Time.deltaTime⟧;
            transform.LookAt(player);
            if (seenFor > ⟦reactionTime⟧ && Time.time > nextShot)
            {
                nextShot = Time.time + 0.6f;
                Debug.Log("${tr('Shot!', 'Выстрел!')}");
            }
        }
        else
        {
            seenFor = ⟦0⟧;
        }
    }

    bool CanSee()
    {
        Vector3 eye = transform.position + Vector3.up * 0.7f;
        Vector3 dir = player.position - eye;
        return Physics.Raycast(eye, dir, out RaycastHit hit, viewDistance) && hit.collider.CompareTag("Player");
    }
}
`,
    file: 'BotReact.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b3',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#b8a07a' }), wall(-1, 5, 4, 0.8, 3, '#a58c66'), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 10], rot: [0, 180, 0], bot: { sight: 0 } }],
      player: { pos: [-1, 0.9, 2] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The bot sees you', 'Бот тебя видит'), check: (w, r) => {
        const see = botSees(w, 'Bot');
        if (see && r.mem.visibleAt === undefined) r.mem.visibleAt = w.time;
        return sticky(r, 'seen', see);
      } },
      { text: T('It fires — but not sooner than 0.35 s after seeing you', 'Стреляет — но не раньше чем через 0,35 с'), check: (w, r) => {
        if (r.mem.shotAt === undefined && logged(w, /Shot!|Выстрел!/)) r.mem.shotAt = w.time;
        return r.mem.shotAt !== undefined && r.mem.visibleAt !== undefined && r.mem.shotAt - r.mem.visibleAt >= 0.35;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Your bots react like people — you get a fair moment.', 'Твои боты реагируют как люди — у тебя есть честный миг.'),
    inUnity: T('Pro shooters tune this number for difficulty: 0.25 s — hard, 0.7 s — easy. Many add a random part: reactionTime + Random.Range(0f, 0.2f).', 'В больших шутерах этим числом настраивают сложность: 0,25 с — сложно, 0,7 с — легко. Часто добавляют случайность: reactionTime + Random.Range(0f, 0.2f).'),
    demo: (t) => ({ until: 1e9, keys: t > 0.8 && t < 1.5 ? ['d'] : [] }),
    demoSeconds: 4,
  },
  {
    id: 'b4',
    chapter: 4,
    icon: '🎯',
    title: T('A hand, not a robot', 'Рука, а не робот'),
    system: T('Bots: aim', 'Боты: прицел'),
    radio: T('A person first aims roughly, then more and more exactly. Give the aim an error that calms down over time: the first shots fly past, then they hit (training rounds, they do not hurt).', 'Человек сначала целится грубо, потом всё точнее. Дай прицелу ошибку, которая со временем успокаивается: первые выстрелы летят мимо, потом попадают (пули учебные, не больно).'),
    task: T('Fill the blanks: early shots mostly miss, later shots mostly hit.', 'Заполни пропуски: первые выстрелы в основном мимо, потом — в основном точно.'),
    words: [
      { word: 'Random.insideUnitSphere', say: T('A random little arrow in any direction (shorter than 1).', 'Случайная маленькая стрелка в любую сторону (короче 1).') },
      { word: 'error = Lerp(error, 0, …)', say: T('The error melts a bit every frame.', 'Ошибка каждый кадр немного «тает».') },
    ],
    hints: [T('Lerp towards 0 with settleSpeed; add insideUnitSphere * error to the direction.', 'Lerp к нулю со settleSpeed; к направлению добавь insideUnitSphere * error.'), T('Lerp, settleSpeed, error', 'Lerp, settleSpeed, error')],
    code: () => `using UnityEngine;

public class BotAim : MonoBehaviour
{
    public Transform player;
    public float startError = 0.35f;
    public float settleSpeed = 1.5f;
    public float fireRate = 0.4f;
    float error;
    float nextShot;

    void Start()
    {
        error = startError;
    }

    void Update()
    {
        transform.LookAt(player);
        error = Mathf.⟦Lerp⟧(error, 0f, ⟦settleSpeed⟧ * Time.deltaTime);

        if (Time.time >= nextShot)
        {
            nextShot = Time.time + fireRate;
            Vector3 eye = transform.position + Vector3.up * 0.7f;
            Vector3 dir = (player.position - eye).normalized + Random.insideUnitSphere * ⟦error⟧;
            if (Physics.Raycast(eye, dir, out RaycastHit hit, 50f) && hit.collider.CompareTag("Player"))
                hit.collider.GetComponent<Health>().TakeDamage(1);
        }
    }
}
`,
    file: 'BotAim.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b4',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#b6a07b' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 10], rot: [0, 180, 0], bot: { sight: 0 } }],
      player: { pos: [0, 0.9, 0] },
      autoInspector: true,
    }),
    goals: [
      { text: T('The first 4 shots: at most 1 hits', 'Первые 4 выстрела: попал не больше 1 раза'), check: (w) => {
        const rays = w.botRays.slice(0, 4);
        return rays.length === 4 && rays.filter((x) => x.hitPlayer).length <= 1;
      } },
      { text: T('Shots 9–14: at least 5 of 6 hit', 'Выстрелы 9–14: попали хотя бы 5 из 6'), check: (w) => {
        const rays = w.botRays.slice(8, 14);
        return rays.length === 6 && rays.filter((x) => x.hitPlayer).length >= 5;
      } },
    ],
    keys: [],
    ability: T('Your bots aim like hands: rough first, then sharp.', 'Твои боты целятся как руки: сначала грубо, потом точно.'),
    inUnity: T('Reset error = startError when the bot loses you and finds you again, and add error when you run fast — it becomes very human.', 'Возвращай error = startError, когда бот теряет и снова находит тебя, и добавляй ошибку, когда ты быстро бежишь, — станет очень по-человечески.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 7,
  },
  {
    id: 'b5',
    chapter: 4,
    icon: '👀',
    title: T('Looking around', 'Оглядываться'),
    system: T('Bots: glances', 'Боты: оглядывание'),
    radio: T('A guard who stares only forward is a statue. People glance to the sides now and then. A coroutine waits a random time, turns the head, waits, turns back — while the body keeps walking.', 'Охранник, который смотрит только вперёд, — статуя. Люди время от времени поглядывают по сторонам. Корутина ждёт случайное время, поворачивает голову, ждёт, возвращает — а тело продолжает идти.'),
    task: T('Fill the blanks: the walking bot must glance to the sides at least 3 times, smoothly.', 'Заполни пропуски: идущий бот должен оглянуться хотя бы 3 раза, плавно.'),
    words: [
      { word: 'transform.Find("Head")', say: T('The head bone of the bot.', 'Кость головы бота.') },
      { word: 'Mathf.LerpAngle', say: T('Like Lerp, but for angles (knows that 350° is next to 10°).', 'Как Lerp, но для углов (знает, что 350° рядом с 10°).') },
      { word: 'while (true) + yield', say: T('Repeat forever, with pauses — only inside a coroutine.', 'Повторять вечно, с паузами — только внутри корутины.') },
    ],
    hints: [T('Find "Head"; wait Random.Range(minWait, maxWait); look 0.8f s; LerpAngle to targetYaw.', 'Найди "Head"; жди Random.Range(minWait, maxWait); смотри 0.8f с; LerpAngle к targetYaw.'), T('"Head", minWait, 0.8f, LerpAngle', '"Head", minWait, 0.8f, LerpAngle')],
    code: () => `using System.Collections;
using UnityEngine;

public class BotGlance : MonoBehaviour
{
    public float minWait = 1f;
    public float maxWait = 2.5f;
    public float turnSpeed = 6f;
    Transform head;
    float headYaw;
    float targetYaw;

    void Start()
    {
        head = transform.Find(⟦"Head"⟧);
        StartCoroutine(LookAround());
    }

    IEnumerator LookAround()
    {
        while (true)
        {
            yield return new WaitForSeconds(Random.Range(⟦minWait⟧, maxWait));
            targetYaw = Random.Range(-70f, 70f);
            yield return new WaitForSeconds(⟦0.8f⟧);
            targetYaw = 0f;
        }
    }

    void Update()
    {
        headYaw = Mathf.⟦LerpAngle⟧(headYaw, targetYaw, turnSpeed * Time.deltaTime);
        head.localRotation = Quaternion.Euler(0, headYaw, 0);
    }
}
`,
    file: 'BotGlance.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b5',
      ...DUSK,
      objects: [...room(30, { wall: '#b4a07c' }), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [-6, 0.9, 6], bot: { sight: 0, speed: 3, profile: { glance: 0 }, waypoints: [[-6, 0.9, 6], [6, 0.9, 6], [6, 0.9, 10], [-6, 0.9, 10]] } }],
      player: { pos: [0, 0.9, -4] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The head turned to the sides 3 times', 'Голова повернулась в стороны 3 раза'), check: (w, r) => {
        const y = headYaw(w, 'Bot');
        if (Math.abs(y) > 25 && r.mem.away !== 1) {
          r.mem.away = 1;
          r.mem.glances = (r.mem.glances ?? 0) + 1;
        }
        if (Math.abs(y) < 10) r.mem.away = 0;
        return sticky(r, 'g3', (r.mem.glances ?? 0) >= 3);
      } },
      { text: T('…smoothly (never faster than 600°/s)', '…плавно (не быстрее 600°/с)'), check: (w, r) => {
        const y = headYaw(w, 'Bot');
        if (r.mem.lastHead !== undefined) r.mem.maxHead = Math.max(r.mem.maxHead ?? 0, Math.abs(y - r.mem.lastHead) / w.dt);
        r.mem.lastHead = y;
        return r.mem.g3 === 1 && (r.mem.maxHead ?? 0) <= 600;
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Your bots look around like living guards.', 'Твои боты оглядываются как живые охранники.'),
    inUnity: T('In real projects the head turn is done in LateUpdate after the Animator, so the animation does not overwrite it.', 'В настоящих проектах поворот головы делают в LateUpdate после Animator, чтобы анимация его не перезаписала.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 14,
  },
  {
    id: 'b6',
    chapter: 4,
    icon: '🧭',
    title: T('Memory and search', 'Память и поиск'),
    system: T('Bots: memory', 'Боты: память'),
    radio: T('A cheating bot always knows where you are. A fair one remembers where it LAST SAW you and goes to check there. Show yourself in the doorway, hide — the bot must come to that doorway, not to you.', 'Бот-читер всегда знает, где ты. Честный помнит, где ПОСЛЕДНИЙ РАЗ тебя видел, и идёт проверить туда. Покажись в проходе и спрячься — бот должен прийти к проходу, а не к тебе.'),
    task: T('Fill the blanks. Peek through the doorway and hide: the bot walks to the place it saw you.', 'Заполни пропуски. Выгляни в проход и спрячься: бот придёт туда, где тебя видел.'),
    words: [
      { word: 'lastSeen', say: T('A remembered point: where you were when it saw you.', 'Запомненная точка: где ты был, когда он тебя видел.') },
      { word: 'bool searching', say: T('Is it going to check? true / false.', 'Идёт ли проверять? true / false.') },
    ],
    hints: [T('Remember player.position; while searching walk to lastSeen; when there — searching = false.', 'Запоминай player.position; пока searching — иди к lastSeen; пришёл — searching = false.'), T('player.position, searching, lastSeen, false', 'player.position, searching, lastSeen, false')],
    code: () => `using UnityEngine;

public class BotSearch : MonoBehaviour
{
    public Transform player;
    public float speed = 3f;
    Vector3 lastSeen;
    bool searching;

    void Update()
    {
        if (CanSee())
        {
            lastSeen = ⟦player.position⟧;
            searching = true;
            transform.LookAt(player);
        }
        else if (⟦searching⟧)
        {
            transform.position = Vector3.MoveTowards(transform.position, ⟦lastSeen⟧, speed * Time.deltaTime);
            transform.LookAt(lastSeen);
            if (Vector3.Distance(transform.position, lastSeen) < 0.3f)
                searching = ⟦false⟧;
        }
    }

    bool CanSee()
    {
        Vector3 eye = transform.position + Vector3.up * 0.7f;
        Vector3 dir = player.position - eye;
        if (Vector3.Angle(transform.forward, dir) > 50f) return false;
        return Physics.Raycast(eye, dir, out RaycastHit hit, 30f) && hit.collider.CompareTag("Player");
    }
}
`,
    file: 'BotSearch.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b6',
      ...DUSK,
      botBrain: 'script',
      objects: [...room(30, { wall: '#b39d79' }), wall(-6, 4, 10, 0.8, 3, '#a58c66'), wall(6, 4, 10, 0.8, 3, '#a58c66'), { name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 12], rot: [0, 180, 0], bot: { sight: 0 } }],
      player: { pos: [5, 0.9, 1.5] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The bot saw you', 'Бот тебя заметил'), check: (w, r) => {
        const see = botSees(w, 'Bot');
        if (see) {
          r.mem.lsx = w.player.pos.x;
          r.mem.lsz = w.player.pos.z;
        }
        return sticky(r, 'seen', see);
      } },
      { text: T('It came to where it last saw you — not to where you are', 'Он пришёл туда, где видел тебя последний раз, — а не туда, где ты сейчас'), check: (w, r) => {
        const bot = objByName(w, 'Bot');
        const ls = field(w, 'lastSeen') as { x: number; z: number } | undefined;
        if (!bot || !ls || r.mem.seen !== 1) return false;
        const there = Math.hypot(bot.pos.x - ls.x, bot.pos.z - ls.z) < 0.5;
        const notYou = Math.hypot(w.player.pos.x - ls.x, w.player.pos.z - ls.z) > 2;
        return sticky(r, 'came', there && notYou && field(w, 'searching') === false);
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('Your bots play fair: they remember and search.', 'Твои боты играют честно: помнят и ищут.'),
    inUnity: T('Add a look-around when it arrives (from the previous mission) and it becomes a real search. Big games also remember sounds the same way.', 'Добавь оглядывание, когда он пришёл (из прошлой миссии), — получится настоящий поиск. В больших играх так же запоминают звуки.'),
    demo: (t, w) => (t < 1.6 ? walkTo(w, v3(0, 0, 2)) : t < 2.4 ? walkTo(w, v3(0, 0, 5)) : t < 3.2 ? walkTo(w, v3(0, 0, 2)) : walkTo(w, v3(5, 0, 1.5))),
    demoSeconds: 9,
  },
  {
    id: 'b7',
    chapter: 4,
    icon: '🎭',
    title: T('A bot\'s character', 'Характер бота'),
    system: T('Bots: character', 'Боты: характер'),
    radio: T('Everything you built — reaction, turning, aim, ears — lives in the built-in brain (BotBrain) as numbers. A character is just a set of numbers. Make a slow "rookie" and beat him. Then play with the sliders on the right while watching him!', 'Всё, что ты собрал, — реакция, поворот, прицел, слух — живёт во встроенном мозге (BotBrain) как числа. Характер — это просто набор чисел. Сделай медленного «новичка» и победи его. Потом поиграй ползунками справа, наблюдая за ним!'),
    task: T('Fill the blanks: give the bot a rookie character, then take him down.', 'Заполни пропуски: дай боту характер новичка и выведи его из боя.'),
    words: [
      { word: 'BotBrain', say: T('The built-in brain of a bot: reaction, turnSpeed, aimError, hearing…', 'Встроенный мозг бота: reaction, turnSpeed, aimError, hearing…') },
      { word: 'profile', say: T('A set of numbers that make a character (rookie, pro, sniper).', 'Набор чисел, из которых получается характер (новичок, профи, снайпер).') },
    ],
    hints: [T('GetComponent<BotBrain>(); copy reaction and aimError into the brain.', 'GetComponent<BotBrain>(); перепиши reaction и aimError в мозг.'), T('BotBrain, reaction, aimError', 'BotBrain, reaction, aimError')],
    code: () => `using UnityEngine;

public class BotCharacter : MonoBehaviour
{
    public float reaction = 0.8f;
    public float turnSpeed = 200f;
    public float aimError = 14f;
    public float hearing = 15f;

    void Start()
    {
        BotBrain brain = GetComponent<⟦BotBrain⟧>();
        brain.reaction = ⟦reaction⟧;
        brain.turnSpeed = turnSpeed;
        brain.aimError = ⟦aimError⟧;
        brain.hearing = hearing;
    }
}
`,
    file: 'BotCharacter.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 'b7',
      ...DUSK,
      objects: [...room(34, { wall: '#b39d79' }), crate(-4, 6), crate(4, 9), { name: 'Rookie', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 12], rot: [0, 180, 0], bot: { damage: 4, waypoints: [[-6, 0.9, 12], [6, 0.9, 12]] } }],
      player: { pos: [0, 0.9, -6], gun: true },
      scripts: official('look', 'move', 'gun'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The character is in the brain', 'Характер записан в мозг'), check: (w) => {
        const b = objByName(w, 'Rookie')?.bot;
        return !!b && b.profile.reaction === num(field(w, 'reaction')) && b.profile.aimError === num(field(w, 'aimError'));
      } },
      { text: T('A rookie: reaction at least 0.5 s', 'Новичок: реакция не меньше 0,5 с'), check: (w) => (objByName(w, 'Rookie')?.bot?.profile.reaction ?? 0) >= 0.5 },
      { text: T('Take the rookie down', 'Выведи новичка из боя'), check: (w) => objByName(w, 'Rookie')?.bot?.state === 'dead' },
    ],
    keys: ['WASD', 'mouse', 'LMB (hold)', 'R'],
    ability: T('You can give bots any character — rookie, pro, sniper — with numbers.', 'Ты умеешь давать ботам любой характер — новичок, профи, снайпер — числами.'),
    inUnity: T('In Unity such sets of numbers are often stored in a ScriptableObject ("BotProfile" asset): one file per character, shared by many bots.', 'В Unity такие наборы чисел часто хранят в ScriptableObject (ассет «BotProfile»): один файл на характер, общий для многих ботов.'),
    demo: (_t, w) => shootAll(w, (o) => !!o.bot && o.bot.state !== 'dead', true),
    demoSeconds: 12,
  },
  // ======================================================================= chapter 5: atmosphere
  {
    id: 's19',
    chapter: 5,
    icon: '🧊',
    title: T('Inertia', 'Инерция'),
    system: T('Body: weight', 'Тело: вес'),
    radio: T('Your body is too "wooden": it starts and stops instantly. A real person speeds up and slows down. Vector3.Lerp moves the speed towards the wanted one a bit every frame.', 'Твоё тело слишком «деревянное»: мгновенно стартует и мгновенно встаёт. Настоящий человек разгоняется и тормозит. Vector3.Lerp каждый кадр понемногу тянет скорость к нужной.'),
    task: T('Fill the blanks. Walk and stop: the speed must grow and fall smoothly.', 'Заполни пропуски. Пройдись и остановись: скорость должна плавно расти и падать.'),
    words: [
      { word: 'Vector3.Lerp(a, b, t)', say: T('A point between a and b: t = 0 → a, t = 1 → b. Every frame a bit closer.', 'Точка между a и b: t = 0 → a, t = 1 → b. Каждый кадр — чуть ближе.') },
      { word: 'velocity', say: T('The current speed (direction × how fast).', 'Текущая скорость (направление × насколько быстро).') },
    ],
    hints: [T('velocity = Vector3.Lerp(velocity, targetVelocity, acceleration * Time.deltaTime); then move by velocity.', 'velocity = Vector3.Lerp(velocity, targetVelocity, acceleration * Time.deltaTime); потом двигайся на velocity.'), T('Lerp, acceleration, velocity', 'Lerp, acceleration, velocity')],
    code: () => `using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    public float speed = 6f;
    public float acceleration = 8f;
    public float gravity = -9.81f;
    CharacterController controller;
    Vector3 velocity;
    float velocityY;

    void Start()
    {
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 targetVelocity = (transform.right * x + transform.forward * z) * speed;

        // ✏️ ${tr('new: the speed catches up with the wanted speed smoothly', 'новое: скорость плавно догоняет нужную')}
        velocity = Vector3.⟦Lerp⟧(velocity, targetVelocity, ⟦acceleration⟧ * Time.deltaTime);
        controller.Move(⟦velocity⟧ * Time.deltaTime);

        if (controller.isGrounded && velocityY < 0) velocityY = -2f;
        velocityY += gravity * Time.deltaTime;
        controller.Move(Vector3.up * velocityY * Time.deltaTime);
    }
}
`,
    file: 'PlayerMovement.cs',
    level: () => ({ id: 's19', ...TRAINING, objects: [...room(30, { wall: '#b4beca' }), zone('Run', 0, 8, 1.3)], player: { pos: [0, 0.9, -6] }, scripts: official('look'), autoInspector: true }),
    goals: [
      { text: T('Speed grows smoothly (no instant start)', 'Скорость растёт плавно (нет мгновенного старта)'), check: (w, r) => {
        const v = Math.hypot(w.player.vel.x, w.player.vel.z);
        if (v > 0.05 && r.mem.startAt === undefined) r.mem.startAt = w.time;
        if (r.mem.startAt !== undefined && w.time - r.mem.startAt < 0.06 && v > 4) r.mem.instant = 1;
        return sticky(r, 'acc', r.mem.startAt !== undefined && !r.mem.instant && v > 5);
      } },
      { text: T('Walk into the circle and stop: you slide a little', 'Дойди до круга и остановись: немного проскользишь'), check: (w, r) => {
        inZone(w, 'Run');
        const v = Math.hypot(w.player.vel.x, w.player.vel.z);
        if (r.mem.acc === 1 && w.keys.size === 0 && v > 1 && v < 5.5) r.mem.slide = (r.mem.slide ?? 0) + 1;
        return sticky(r, 'stop', (r.mem.slide ?? 0) > 4 && v < 0.2);
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('The body has weight: smooth start and stop.', 'У тела есть вес: плавный старт и остановка.'),
    inUnity: T('acceleration = 8 feels like a person; 2 — like ice; 30 — almost instant. Choose what fits your game.', 'acceleration = 8 — как человек; 2 — как на льду; 30 — почти мгновенно. Выбери, что подходит твоей игре.'),
    demo: (t) => ({ until: 1e9, keys: t < 1.6 ? ['w'] : [] }),
    demoSeconds: 3,
  },
  {
    id: 's20',
    chapter: 5,
    icon: '〰️',
    title: T('Head bob', 'Покачивание головы'),
    system: T('Camera: steps', 'Камера: шаги'),
    radio: T('When a person walks, the head goes up and down with every step. Mathf.Sin makes a smooth wave. This script lives on the camera.', 'Когда человек идёт, голова при каждом шаге чуть поднимается и опускается. Mathf.Sin даёт плавную волну. Этот скрипт живёт на камере.'),
    task: T('Fill the blanks. Walk: the view sways. Stop: it calms down.', 'Заполни пропуски. Иди — взгляд покачивается. Встань — успокаивается.'),
    words: [
      { word: 'Mathf.Sin(t)', say: T('A wave: goes from -1 to 1 and back as t grows.', 'Волна: ходит от -1 до 1 и обратно, пока растёт t.') },
      { word: 'localPosition', say: T('The position relative to the parent (the head).', 'Положение относительно родителя (головы).') },
      { word: 'GetComponentInParent', say: T('Look for the part on the parents (the player).', 'Искать деталь у родителей (у игрока).') },
    ],
    hints: [T('timer grows by frequency; the wave is Mathf.Sin; when standing — Lerp back to zero.', 'timer растёт на frequency; волна — Mathf.Sin; стоя — Lerp обратно к нулю.'), T('frequency, Sin, Lerp', 'frequency, Sin, Lerp')],
    code: () => `using UnityEngine;

public class HeadBob : MonoBehaviour
{
    public float frequency = 10f;
    public float amplitude = 0.05f;
    CharacterController controller;
    float timer;

    void Start()
    {
        controller = GetComponentInParent<CharacterController>();
    }

    void Update()
    {
        Vector3 v = controller.velocity;
        float speed = new Vector3(v.x, 0, v.z).magnitude;

        if (speed > 0.5f && controller.isGrounded)
        {
            timer += Time.deltaTime * ⟦frequency⟧;
            float y = Mathf.⟦Sin⟧(timer) * amplitude;
            float x = Mathf.Cos(timer / 2f) * amplitude * 0.5f;
            transform.localPosition = new Vector3(x, y, 0);
        }
        else
        {
            timer = 0;
            transform.localPosition = Vector3.⟦Lerp⟧(transform.localPosition, Vector3.zero, 10f * Time.deltaTime);
        }
    }
}
`,
    file: 'HeadBob.cs',
    attachTo: 'Main Camera',
    level: () => ({ id: 's20', ...TRAINING, objects: [...room(30, { wall: '#b1bcc8' })], player: { pos: [0, 0.9, -8] }, scripts: official('look', 'move'), autoInspector: true }),
    goals: [
      { text: T('The view sways while you walk', 'Взгляд покачивается при ходьбе'), check: (w, r) => {
        const y = w.camera.local!.pos.y;
        if (Math.hypot(w.player.vel.x, w.player.vel.z) > 1) {
          r.mem.min = Math.min(r.mem.min ?? 9, y);
          r.mem.max = Math.max(r.mem.max ?? -9, y);
        }
        return sticky(r, 'bob', (r.mem.max ?? 0) - (r.mem.min ?? 0) > 0.06);
      } },
      { text: T('Stop: the view calms down', 'Встань: взгляд успокоился'), check: (w, r) => r.mem.bob === 1 && sticky(r, 'calm', Math.hypot(w.player.vel.x, w.player.vel.z) < 0.05 && Math.abs(w.camera.local!.pos.y) < 0.004) },
    ],
    keys: ['WASD', 'mouse', 'Shift'],
    ability: T('Steps: the camera sways with walking.', 'Шаги: камера покачивается при ходьбе.'),
    inUnity: T('Put this script on the Main Camera (a child of the player). Keep amplitude small (0.03–0.06): a big sway makes people feel sick.', 'Повесь скрипт на Main Camera (дочернюю у игрока). Амплитуду держи маленькой (0.03–0.06): сильная качка укачивает.'),
    demo: (t) => ({ until: 1e9, keys: t < 2 ? ['w'] : [] }),
    demoSeconds: 4,
  },
  {
    id: 's21',
    chapter: 5,
    icon: '🌀',
    title: T('Feeling of speed', 'Ощущение скорости'),
    system: T('Camera: speed', 'Камера: скорость'),
    radio: T('In fast games the field of view widens when you sprint — it feels like speed. Mathf.Lerp changes the number smoothly.', 'В быстрых играх при беге угол обзора расширяется — появляется ощущение скорости. Mathf.Lerp меняет число плавно.'),
    task: T('Fill the blanks. Sprint (Shift + W): the view widens, then returns.', 'Заполни пропуски. Беги (Shift + W): обзор расширяется, потом возвращается.'),
    words: [
      { word: 'fieldOfView', say: T('How wide the camera sees, in degrees (70 — normal).', 'Насколько широко видит камера, в градусах (70 — обычно).') },
      { word: 'Mathf.Lerp(a, b, t)', say: T('A number between a and b — smooth change.', 'Число между a и b — плавное изменение.') },
    ],
    hints: [T('Sprinting → sprintFov, otherwise normalFov. Smoothly: Lerp.', 'Бежишь → sprintFov, иначе normalFov. Плавно — Lerp.'), T('sprintFov, normalFov, Lerp', 'sprintFov, normalFov, Lerp')],
    code: () => `using UnityEngine;

public class SpeedFov : MonoBehaviour
{
    public float normalFov = 70f;
    public float sprintFov = 85f;
    Camera cam;

    void Start()
    {
        cam = GetComponent<Camera>();
    }

    void Update()
    {
        bool sprinting = Input.GetKey(KeyCode.LeftShift) && Input.GetAxis("Vertical") > 0;
        float target = sprinting ? ⟦sprintFov⟧ : ⟦normalFov⟧;
        cam.fieldOfView = Mathf.⟦Lerp⟧(cam.fieldOfView, target, 8f * Time.deltaTime);
    }
}
`,
    file: 'SpeedFov.cs',
    attachTo: 'Main Camera',
    level: () => ({ id: 's21', ...TRAINING, objects: [...room(40, { wall: '#aeb9c5' })], player: { pos: [0, 0.9, -15] }, scripts: official('look', 'move'), autoInspector: true }),
    goals: [
      { text: T('Sprint: the view widens (FOV > 82)', 'Бег: обзор шире (FOV > 82)'), check: (w, r) => sticky(r, 'wide', (w.camera.fov ?? 70) > 82) },
      { text: T('Stop: it returns (FOV < 72)', 'Остановка: обзор вернулся (FOV < 72)'), check: (w, r) => r.mem.wide === 1 && sticky(r, 'back', (w.camera.fov ?? 70) < 72) },
    ],
    keys: ['WASD', 'mouse', 'Shift'],
    ability: T('Speed: the view widens when you sprint.', 'Скорость: обзор расширяется на бегу.'),
    inUnity: T('The same script on the Main Camera. Battle shooters use 5–15 degrees of difference — more looks like a fish eye.', 'Тот же скрипт на Main Camera. В боевых шутерах разница 5–15 градусов — больше выглядит как «рыбий глаз».'),
    demo: (t) => ({ until: 1e9, keys: t < 1.5 ? ['w', 'Shift'] : [] }),
    demoSeconds: 3,
  },
  {
    id: 's22',
    chapter: 5,
    icon: '↔️',
    title: T('Leaning', 'Наклоны'),
    system: T('Body: leaning', 'Тело: наклоны'),
    radio: T('Peek around a corner without leaving cover: Q — lean left, E — right. The script lives on the Head (the neck): it tilts and shifts a little. A target hides behind the wall — find it.', 'Выгляни из-за угла, не выходя из укрытия: Q — наклон влево, E — вправо. Скрипт живёт на Head (шее): наклоняет и чуть сдвигает. За стеной прячется мишень — найди её.'),
    task: T('Fill the blanks. Lean both ways, then from the circle lean out and look at the hidden target.', 'Заполни пропуски. Наклонись в обе стороны, потом из круга выгляни и посмотри на спрятанную мишень.'),
    words: [
      { word: 'localRotation', say: T('The rotation relative to the parent.', 'Поворот относительно родителя.') },
      { word: 'Quaternion.Euler(0, 0, z)', say: T('Tilt around the axis pointing forward (like tilting your head).', 'Наклон вокруг оси «вперёд» (как наклон головы).') },
    ],
    hints: [T('Q → 1f, E → -1f. The angle: current * angle.', 'Q → 1f, E → -1f. Угол: current * angle.'), T('1f, -1f, angle', '1f, -1f, angle')],
    code: () => `using UnityEngine;

public class Lean : MonoBehaviour
{
    public float angle = 15f;
    public float offset = 0.45f;
    public float speed = 8f;
    float current;

    void Update()
    {
        float target = 0f;
        if (Input.GetKey(KeyCode.Q)) target = ⟦1f⟧;
        if (Input.GetKey(KeyCode.E)) target = ⟦-1f⟧;
        current = Mathf.Lerp(current, target, speed * Time.deltaTime);

        transform.localRotation = Quaternion.Euler(0, 0, current * ⟦angle⟧);
        transform.localPosition = new Vector3(-current * offset, transform.localPosition.y, 0);
    }
}
`,
    file: 'Lean.cs',
    attachTo: 'Head',
    level: () => ({
      id: 's22',
      ...DUSK,
      objects: [...room(30, { wall: '#b8a07a' }), wall(-3.5, 2, 7, 0.4, 3, '#a58c66'), zone('Cover', -0.8, 1, 0.3), { name: 'Hidden target', tag: 'Lamp', shape: 'target', pos: [3, 1.6, 8], size: [0.9, 0.9, 0.12], color: '#9aa7b8' }],
      player: { pos: [-0.8, 0.9, -2] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('Lean left (Q) and right (E)', 'Наклонись влево (Q) и вправо (E)'), check: (w, r) => {
        const roll = qToEuler(w.head.local!.rot).z;
        if (roll > 10 && roll < 90) r.mem.l = 1;
        if (roll < 350 && roll > 270) r.mem.r = 1;
        return sticky(r, 'both', r.mem.l === 1 && r.mem.r === 1);
      } },
      { text: T('From the circle, look at the hidden target', 'Из круга посмотри на спрятанную мишень'), check: (w, r) => {
        const t = objByName(w, 'Hidden target');
        if (!t || !inZone(w, 'Cover')) return r.mem.peek === 1;
        const eye = w.camera.pos;
        const hit = w.raycast(eye, v3(t.pos.x - eye.x, t.pos.y - eye.y, t.pos.z - eye.z), 50);
        return sticky(r, 'peek', !!hit && hit.obj === t && lookedAt(w, 'Hidden target', 10));
      } },
    ],
    keys: ['WASD', 'mouse', 'Q', 'E'],
    ability: T('Leaning: Q and E.', 'Наклоны: Q и E.'),
    inUnity: T('Make an empty "Head" object inside the player, put the Main Camera inside it, put Lean on Head. Then mouse look and leaning do not fight.', 'Сделай пустой объект «Head» внутри игрока, Main Camera положи внутрь него, Lean — на Head. Тогда обзор мышью и наклоны не мешают друг другу.'),
    demo: (_t, w, r) => {
      if (r.mem.both !== 1) return { until: 1e9, keys: w.frameNo % 80 < 40 ? ['q'] : ['e'] };
      if (!inZone(w, 'Cover')) return walkTo(w, v3(-0.8, 0, 1));
      const t = objByName(w, 'Hidden target')!;
      return { until: 1e9, keys: ['e'], mouse: aimAt(w, t.pos).mouse };
    },
    demoSeconds: 9,
  },
  {
    id: 's23',
    chapter: 5,
    icon: '🔫',
    title: T('A living weapon', 'Живое оружие'),
    system: T('Weapon: weight and recoil', 'Оружие: вес и отдача'),
    radio: T('A weapon glued to the screen looks fake. Make it lag behind the mouse a little (sway) and kick back on every shot (recoil), then return.', 'Оружие, приклеенное к экрану, выглядит ненастоящим. Пусть оно чуть отстаёт от мыши (покачивание) и отскакивает назад при выстреле (отдача), а потом возвращается.'),
    task: T('Fill the blanks. Turn and shoot: the weapon sways and kicks. Knock down the targets.', 'Заполни пропуски. Поворачивайся и стреляй: оружие качается и отдаёт. Сбей мишени.'),
    words: [
      { word: 'startPos', say: T('Where the weapon was at the start: it always comes back here.', 'Где оружие было в начале: оно всегда возвращается сюда.') },
      { word: 'recoil += …', say: T('Each shot adds a kick.', 'Каждый выстрел добавляет толчок.') },
    ],
    hints: [T('sway = mouse × swayAmount. A kick goes back: -recoilKick in z. Return with returnSpeed.', 'sway = мышь × swayAmount. Толчок назад: -recoilKick по z. Возврат — returnSpeed.'), T('swayAmount, recoilKick, returnSpeed', 'swayAmount, recoilKick, returnSpeed')],
    code: () => `using UnityEngine;

public class WeaponFeel : MonoBehaviour
{
    public float swayAmount = 0.02f;
    public float recoilKick = 0.08f;
    public float returnSpeed = 10f;
    Vector3 startPos;
    Vector3 recoil;

    void Start()
    {
        startPos = transform.localPosition;
    }

    void Update()
    {
        float mx = Input.GetAxis("Mouse X");
        float my = Input.GetAxis("Mouse Y");
        Vector3 sway = new Vector3(-mx, -my, 0) * ⟦swayAmount⟧;

        if (Input.GetMouseButton(0))
            recoil += new Vector3(0, 0.004f, -⟦recoilKick⟧) * Time.deltaTime * 10f;

        recoil = Vector3.Lerp(recoil, Vector3.zero, ⟦returnSpeed⟧ * Time.deltaTime);
        Vector3 target = startPos + sway + recoil;
        transform.localPosition = Vector3.Lerp(transform.localPosition, target, 12f * Time.deltaTime);
        transform.localRotation = Quaternion.Euler(recoil.z * 150f, -mx * 2f, 0);
    }
}
`,
    file: 'WeaponFeel.cs',
    attachTo: 'Gun',
    level: () => ({
      id: 's23',
      ...RANGE,
      objects: [...room(30, { wall: '#bcae95' }), target('T1', -4, 10, 60), target('T2', 0, 13, 60), target('T3', 4, 10, 60)],
      player: { pos: [0, 0.9, -3], gun: true },
      scripts: official('look', 'move', 'gun'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The weapon sways when you turn', 'Оружие качается при повороте'), check: (w, r) => {
        const g = w.gun?.local;
        return sticky(r, 'sway', !!g && Math.abs(g.pos.x - 0.25) > 0.008);
      } },
      { text: T('The weapon kicks back when you shoot', 'Оружие отдаёт назад при стрельбе'), check: (w, r) => {
        const g = w.gun?.local;
        return sticky(r, 'kick', !!g && g.pos.z < 0.45 - 0.012);
      } },
      { text: T('Knock down the targets', 'Сбей мишени'), check: (w) => aliveWith(w, 'Target').length === 0 },
    ],
    keys: ['WASD', 'mouse', 'LMB (hold)', 'R'],
    ability: T('The weapon is alive: sway and recoil.', 'Оружие живое: покачивание и отдача.'),
    inUnity: T('Put WeaponFeel on the weapon model (a child of the camera). Real games also kick the camera up a little — try it on your own!', 'Повесь WeaponFeel на модель оружия (дочернюю у камеры). В настоящих играх ещё чуть подбрасывают камеру — попробуй сам!'),
    demo: (_t, w) => shootAll(w, 'Target', true),
    demoSeconds: 9,
  },
  {
    id: 's24',
    chapter: 5,
    icon: '🕺',
    title: T('A living body', 'Живое тело'),
    system: T('Bots: animation', 'Боты: анимация'),
    radio: T('The bots slide like statues. Let us animate them by code — procedural animation: legs swing in turn with a sine wave, arms swing the other way, the body turns a little.', 'Боты скользят, как статуи. Оживим их кодом — процедурная анимация: ноги по очереди качаются по синусу, руки — наоборот, корпус чуть поворачивается.'),
    task: T('Fill the blanks. The legs of the walking bot must move in turn.', 'Заполни пропуски. Ноги идущего бота должны двигаться по очереди.'),
    words: [
      { word: 'transform.Find("LeftLeg")', say: T('Find a child part by its name.', 'Найти дочернюю часть по имени.') },
      { word: 'procedural animation', say: T('Movement calculated by code, not drawn by hand.', 'Движение, посчитанное кодом, а не нарисованное вручную.') },
    ],
    hints: [T('cycle grows with stepSpeed. Left leg: swing, right leg: -swing (the other way).', 'cycle растёт со stepSpeed. Левая нога — swing, правая — -swing (в другую сторону).'), T('stepSpeed, swing, -swing', 'stepSpeed, swing, -swing')],
    code: () => `using UnityEngine;

public class BotBody : MonoBehaviour
{
    public float stepSpeed = 3f;
    public float legSwing = 35f;
    Transform leftLeg;
    Transform rightLeg;
    Transform leftArm;
    Transform rightArm;
    Transform spine;
    Vector3 lastPos;
    float cycle;

    void Start()
    {
        leftLeg = transform.Find("LeftLeg");
        rightLeg = transform.Find("RightLeg");
        leftArm = transform.Find("LeftArm");
        rightArm = transform.Find("RightArm");
        spine = transform.Find("Spine");
        lastPos = transform.position;
    }

    void Update()
    {
        float speed = (transform.position - lastPos).magnitude / Time.deltaTime;
        lastPos = transform.position;

        cycle += speed * Time.deltaTime * ⟦stepSpeed⟧;
        float swing = Mathf.Sin(cycle) * legSwing * Mathf.Clamp01(speed / 2f);

        leftLeg.localRotation = Quaternion.Euler(⟦swing⟧, 0, 0);
        rightLeg.localRotation = Quaternion.Euler(⟦-swing⟧, 0, 0);
        leftArm.localRotation = Quaternion.Euler(-swing * 0.7f, 0, 0);
        rightArm.localRotation = Quaternion.Euler(swing * 0.7f, 0, 0);
        spine.localRotation = Quaternion.Euler(0, Mathf.Sin(cycle) * 5f, 0);
    }
}
`,
    file: 'BotBody.cs',
    attachTo: '#Enemy',
    level: () => ({
      id: 's24',
      ...DUSK,
      botLegs: 'script',
      objects: [...room(30, { wall: '#b6a07c' }), { name: 'Walker', tag: 'Enemy', shape: 'humanoid', pos: [-5, 0.9, 6], bot: { sight: 0, speed: 3, waypoints: [[-5, 0.9, 6], [5, 0.9, 6], [5, 0.9, 10], [-5, 0.9, 10]] } }],
      player: { pos: [0, 0.9, -3] },
      scripts: official('look', 'move'),
      autoInspector: true,
    }),
    goals: [
      { text: T('The legs swing (more than 15°)', 'Ноги качаются (больше 15°)'), check: (w, r) => {
        const b = objByName(w, 'Walker');
        const l = b?.bones?.LeftLeg?.local;
        return sticky(r, 'legs', !!l && Math.abs(qToEuler(l.rot).x > 180 ? qToEuler(l.rot).x - 360 : qToEuler(l.rot).x) > 15);
      } },
      { text: T('…in turn (left forward — right back)', '…по очереди (левая вперёд — правая назад)'), check: (w, r) => {
        const b = objByName(w, 'Walker');
        if (!b?.bones) return false;
        const ang = (n: string) => {
          const x = qToEuler(b.bones![n].local!.rot).x;
          return x > 180 ? x - 360 : x;
        };
        return sticky(r, 'turn', ang('LeftLeg') * ang('RightLeg') < -100);
      } },
    ],
    keys: ['WASD', 'mouse'],
    ability: T('You animate bodies with code.', 'Ты оживляешь тела кодом.'),
    inUnity: T('With a real 3D model the same idea drives its bones (Animator + scripts in LateUpdate). This is how games make walking, breathing, aiming "alive".', 'С настоящей 3D-моделью та же идея управляет её костями (Animator + скрипты в LateUpdate). Так в играх делают живую ходьбу, дыхание, прицеливание.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 4,
  },
  // ======================================================================== chapter 5: operation
  {
    id: 's25',
    chapter: 6,
    icon: '🏆',
    title: T('Operation "Dusty Yard"', 'Операция «Пыльный двор»'),
    system: T('Command: the match', 'Штаб: матч'),
    radio: T('All systems are back. Last thing — the match itself: a GameManager counts the enemies and the time and decides who won. Your team: you and two allies. Go!', 'Все системы в строю. Последнее — сам матч: GameManager считает врагов и время и решает, кто победил. Твоя команда — ты и двое союзников. Вперёд!'),
    task: T('Fill the blanks and win the round: take down all 5 enemies.', 'Заполни пропуски и выиграй раунд: выведи из боя всех 5 врагов.'),
    words: [
      { word: 'FindGameObjectsWithTag', say: T('All objects with the tag — as an array.', 'Все объекты с тегом — массивом.') },
      { word: '.Length', say: T('How many are in the array.', 'Сколько их в массиве.') },
      { word: '||', say: T('"or": one of the two is enough.', '«или»: хватит одного из двух.') },
    ],
    hints: [T('Enemies have the tag "Enemy". Victory when there are 0. Loss when time is 0 or less.', 'У врагов тег "Enemy". Победа — когда их 0. Поражение — когда времени 0 или меньше.'), T('"Enemy", 0, 0', '"Enemy", 0, 0')],
    code: () => `using UnityEngine;
using TMPro;

public class GameManager : MonoBehaviour
{
    public TMP_Text enemiesText;
    public TMP_Text timerText;
    public Health playerHealth;
    public float roundTime = 180f;
    bool over = false;

    void Update()
    {
        if (over) return;

        roundTime -= Time.deltaTime;
        timerText.text = "⏱ " + Mathf.CeilToInt(roundTime);

        int enemies = GameObject.FindGameObjectsWithTag(⟦"Enemy"⟧).Length;
        enemiesText.text = "${tr('Enemies: ', 'Врагов: ')}" + enemies;

        if (enemies == ⟦0⟧)
            EndRound("${tr('VICTORY!', 'ПОБЕДА!')}");
        else if (playerHealth.currentHealth <= 0 || roundTime <= ⟦0⟧)
            EndRound("${tr('Round lost', 'Раунд проигран')}");
    }

    void EndRound(string message)
    {
        over = true;
        Debug.Log(message);
        enemiesText.text = message;
    }
}
`,
    file: 'GameManager.cs',
    attachTo: 'GameManager',
    level: () => matchLevel('s25'),
    goals: [
      { text: T('Take down all enemies', 'Выведи из боя всех врагов'), check: (w) => w.redLeft() === 0 },
      { text: T('The GameManager announces the victory', 'GameManager объявил победу'), check: (w, r) => sticky(r, 'win', logged(w, /VICTORY|ПОБЕДА/)) },
    ],
    keys: ['WASD', 'mouse', 'LMB', 'R', 'Shift', 'C', 'Space'],
    ability: T('The whole game is yours. Free play is open — change any script!', 'Вся игра — твоя. Открыта свободная игра — меняй любой скрипт!'),
    inUnity: T('An empty object "GameManager" with this script, two TextMeshPro texts on a Canvas, and the bots tagged "Enemy". That is a real round-based shooter.', 'Пустой объект «GameManager» с этим скриптом, два текста TextMeshPro на Canvas и боты с тегом "Enemy". Это настоящий раундовый шутер.'),
    demo: (_t, w) => battleDemo(w),
    demoSeconds: 150,
  },
];



/** The level of the final match (also used by free play). */
export function matchLevel(id: string, scripts?: { source: string; on: string }[]): Level3 {
  return {
    id,
    ...DUSK,
    objects: [...dustyYard(), ...RED_TEAM, ...BLUE_TEAM, { name: 'GameManager', shape: 'none', pos: [0, 0, 0] }],
    player: { pos: [0, 0.9, -21], gun: true, health: 100 },
    scripts: scripts ?? official('look', 'move', 'gun'),
    autoInspector: true,
  };
}

/** A simple "player" for the battle demo: go up the middle, shoot every enemy that is visible. */
function battleDemo(w: World3D): DemoStep3 {
  const reds = w.objects.filter((o) => o.bot && o.alive && o.bot.team !== 'blue' && o.bot.state !== 'dead');
  const visible = reds.filter((o) => {
    const eye = w.camera.pos;
    const hit = w.raycast(eye, v3(o.pos.x - eye.x, o.pos.y + 0.3 - eye.y, o.pos.z - eye.z), 60);
    return hit && w.isPartOf(hit.obj, o);
  });
  if (visible.length) return shootAll(w, (o) => visible.includes(o), true);
  if (!reds.length) return { until: 1e9 };
  // walk towards the nearest enemy along simple waypoints (doors in the lane walls)
  reds.sort((a, b) => Math.hypot(a.pos.x - w.player.pos.x, a.pos.z - w.player.pos.z) - Math.hypot(b.pos.x - w.player.pos.x, b.pos.z - w.player.pos.z));
  const t = reds[0];
  const p = w.player.pos;
  const laneOf = (x: number) => (x < -8 ? -1 : x > 8 ? 1 : 0);
  let goal = t.pos;
  if (laneOf(t.pos.x) !== laneOf(p.x) && Math.abs(p.z + 1.8) > 1) goal = v3(laneOf(p.x) * 12, 0, -1.8);
  else if (laneOf(t.pos.x) !== laneOf(p.x)) goal = v3(laneOf(t.pos.x) * 12, 0, -1.8);
  return walkTo(w, goal);
}

export const MISSION_IDS = new Set(MISSIONS.map((m) => m.id));
export const missionById = (id: string) => MISSIONS.find((m) => m.id === id);

/** The free-play match: every script of the finished game, editable. */
export const FREE_PLAY_SCRIPTS = (): { file: string; on: string; source: string }[] => [
  { file: 'PlayerMovement.cs', on: 'Player', source: OFFICIAL.move },
  { file: 'MouseLook.cs', on: 'Player', source: OFFICIAL.look },
  { file: 'Gun.cs', on: 'Player', source: OFFICIAL.gun },
  { file: 'HeadBob.cs', on: 'Main Camera', source: answerOf(missionById('s20')!) },
  { file: 'SpeedFov.cs', on: 'Main Camera', source: answerOf(missionById('s21')!) },
  { file: 'Lean.cs', on: 'Head', source: answerOf(missionById('s22')!) },
  { file: 'WeaponFeel.cs', on: 'Gun', source: answerOf(missionById('s23')!) },
  { file: 'GameManager.cs', on: 'GameManager', source: answerOf(missionById('s25')!) },
];

/** Creates the world of a mission and loads the learner's script. Problems = compile errors. */
export async function startMission(m: Mission, code: string): Promise<{ world: World3D; problems: Awaited<ReturnType<World3D['load']>> }> {
  const world = new World3D(m.level());
  const problems = await world.load(code, m.attachTo ?? 'Player');
  return { world, problems };
}

/** Checks the goals once (call after every frame). Returns which goals are done. */
export function checkGoals(m: Mission, w: World3D, run: MissionRun): boolean[] {
  return m.goals.map((g, i) => {
    const key = `__goal${i}`;
    if (run.mem[key] === 1) return true;
    if (g.check(w, run)) run.mem[key] = 1;
    return run.mem[key] === 1;
  });
}

export const missionTitle = (m: Mission) => `${m.icon} ${pick(m.title)}`;
export { QI };
