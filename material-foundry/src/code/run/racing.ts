// Campaign "Racing from zero": 12 lessons on a real race track. You write the car (gas, steering,
// brakes, grass, crashes), a lap timer, a Trackmania-style ghost of your best lap (see-through when
// it is close), the paint, BeamNG-style dents and parts that fly off, an autopilot with sensors and
// finally a car that LEARNS to drive by evolution. Pure data + checks (tested), drawn by Scene3D.

import { tr, type Text2 } from '../i18n';
import { field, logged, num, objByName, sticky, type Mission, type MissionRun } from './shooter';
import { qRotate, qToEuler, sampleTrack, v3, type DemoStep3, type Level3, type Spec3, type Track3, type V3, type World3D } from './unity3d';

const T = (en: string, ru: string): Text2 => ({ en, ru });

export const RACE_CHAPTERS: { n: number; icon: string; title: Text2; about: Text2 }[] = [
  { n: 1, icon: '🏁', title: T('Driving', 'Вождение'), about: T('Gas, steering, brakes, grass and crashes: the physics of an arcade car.', 'Газ, руль, тормоз, трава и удары: физика аркадной машины.') },
  { n: 2, icon: '⏱', title: T('Race', 'Гонка'), about: T('Laps and times, a ghost of your best lap, your own paint.', 'Круги и время, призрак лучшего круга, своя покраска.') },
  { n: 3, icon: '💥', title: T('Damage', 'Повреждения'), about: T('Dents in the body and parts that fly off, like in BeamNG.', 'Вмятины на кузове и отлетающие детали, как в BeamNG.') },
  { n: 4, icon: '🤖', title: T('AI that learns', 'ИИ, который учится'), about: T('An autopilot with sensors, then a car that learns to drive by itself.', 'Автопилот с датчиками, потом машина, которая сама учится ездить.') },
];

// ------------------------------------------------------------------------------------ the track

export const TRACK: Track3 = {
  width: 12,
  runoff: 4,
  points: [[0, -10], [0, 70], [8, 95], [30, 106], [55, 96], [63, 72], [52, 52], [60, 32], [86, 26], [102, 4], [92, -26], [62, -38], [30, -36], [8, -26]],
};
const SAMPLED = sampleTrack(TRACK);

/** A point on the centre line at a share of the lap (0…1), and the driving direction there. */
export function trackAt(frac: number): { x: number; z: number; yaw: number } {
  const s = ((frac % 1) + 1) % 1 * SAMPLED.len;
  let i = 0;
  while (i < SAMPLED.pts.length - 1 && SAMPLED.s[i + 1] < s) i++;
  const a = SAMPLED.pts[i];
  const b = SAMPLED.pts[(i + 1) % SAMPLED.pts.length];
  return { x: a.x, z: a.z, yaw: (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI };
}

/** Trees around the track (never on it), the same every time. */
function scenery(): Spec3[] {
  const out: Spec3[] = [];
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const off = TRACK.width / 2 + (TRACK.runoff ?? 4);
  const tooClose = (x: number, z: number) => SAMPLED.pts.some((p) => Math.hypot(p.x - x, p.z - z) < off + 3);
  for (let k = 0; k < 90; k++) {
    const t = trackAt(k / 90);
    const side = r() < 0.5 ? -1 : 1;
    const d = off + 5 + r() * 18;
    const yaw = (t.yaw * Math.PI) / 180;
    const x = t.x + Math.cos(yaw) * d * side;
    const z = t.z - Math.sin(yaw) * d * side;
    if (tooClose(x, z)) continue;
    const h = 5 + r() * 5;
    out.push({ name: 'Tree', shape: 'tree', pos: [x, h / 2, z], size: [2.4 + r() * 1.8, h, 2.4], color: ['#3f7f3a', '#2f6b34', '#4c8a3c'][k % 3], solid: false });
  }
  return out;
}
const SCENERY = scenery();

const GATE = (name: string, tag: string, frac: number, color = '#ffd166'): Spec3 => {
  const t = trackAt(frac);
  return { name, tag, shape: 'zone', pos: [t.x, 0.05, t.z], size: [16, 4, 16], color, emissive: true };
};
export const CHECKPOINTS = (): Spec3[] => [GATE('Finish', 'Finish', 0.002, '#ffffff'), GATE('CP0', 'Checkpoint', 0.25), GATE('CP1', 'Checkpoint', 0.5), GATE('CP2', 'Checkpoint', 0.75)];

const START = trackAt(0.01);
export function raceLevel(id: string, o: { objects?: Spec3[]; scripts?: { source: string; on: string }[]; chase?: string; hidePlayer?: boolean; start?: number } = {}): Level3 {
  const st = trackAt(o.start ?? 0.012);
  return {
    id,
    mode: 'race',
    track: TRACK,
    sky: '#cfe2f3',
    fog: 0.004,
    floor: { size: 400, color: '#7fae5c' },
    objects: [...SCENERY, ...(o.objects ?? [])],
    player: { pos: [st.x, 0.65, st.z], yaw: st.yaw },
    scripts: o.scripts,
    autoInspector: true,
    chase: o.chase,
    hidePlayer: o.hidePlayer,
  };
}

// ------------------------------------------------------------------------------------ helpers

const kmh = (w: World3D, name = 'Player') => {
  const o = objByName(w, name);
  return o ? Math.hypot(o.vel.x, o.vel.z) * 3.6 : 0;
};
/** Laps driven: distance along the track counted continuously (for "completed a lap"). */
function trackProgress(w: World3D, r: MissionRun, name: string, key: string): number {
  const o = objByName(w, name);
  if (!o || !w.trackPts.length) return 0;
  const along = w.trackInfo(o.pos).along;
  const prev = r.mem[`${key}_last`];
  if (prev !== undefined) {
    let d = along - prev;
    if (d < -w.trackLen / 2) d += w.trackLen;
    if (d > w.trackLen / 2) d -= w.trackLen;
    r.mem[`${key}_total`] = (r.mem[`${key}_total`] ?? 0) + d;
  }
  r.mem[`${key}_last`] = along;
  return r.mem[`${key}_total`] ?? 0;
}
const passedFrac = (w: World3D, r: MissionRun, name: string, frac: number) => trackProgress(w, r, name, `p_${name}`) >= frac * w.trackLen;

/** "Show me": drives the car along the track with the keys (the learner's script reads them). */
export function drive(w: World3D, o: { throttle?: number; aheadMin?: number; steerTo?: number } = {}): DemoStep3 {
  const car = w.player;
  const info = w.trackInfo(car.pos);
  const v = Math.hypot(car.vel.x, car.vel.z);
  const ahead = Math.max(o.aheadMin ?? 9, 7 + v * 0.55);
  // the point ahead on the centre line (or shifted sideways)
  let s = (info.along + ahead) % w.trackLen;
  let i = 0;
  while (i < w.trackPts.length - 1 && w.trackS[i + 1] < s) i++;
  const a = w.trackPts[i];
  const b = w.trackPts[(i + 1) % w.trackPts.length];
  const dir = { x: b.x - a.x, z: b.z - a.z };
  const l = Math.hypot(dir.x, dir.z) || 1;
  const side = o.steerTo ?? 0;
  const tx = a.x + (dir.z / l) * side;
  const tz = a.z - (dir.x / l) * side;
  const want = (Math.atan2(tx - car.pos.x, tz - car.pos.z) * 180) / Math.PI;
  const yaw = qToEuler(car.rot).y;
  const err = ((want - yaw + 540) % 360) - 180;
  // look further ahead to know how sharp the coming turn is
  s = (info.along + 28) % w.trackLen;
  let j = 0;
  while (j < w.trackPts.length - 1 && w.trackS[j + 1] < s) j++;
  const far = w.trackPts[j];
  const farErr = Math.abs(((((Math.atan2(far.x - car.pos.x, far.z - car.pos.z) * 180) / Math.PI - yaw) + 540) % 360) - 180);
  const keys: string[] = [];
  if (err > 2.5) keys.push('d');
  else if (err < -2.5) keys.push('a');
  const maxV = farErr > 45 ? 15 : farErr > 25 ? 21 : 40;
  const throttle = o.throttle ?? 1;
  if (v > maxV + 2) keys.push('s');
  else if (v < maxV * throttle) {
    // a lighter right foot: press the gas only part of the time
    if (throttle >= 1 || (w.frameNo % 10) / 10 < throttle) keys.push('w');
  }
  return { until: 1e9, keys };
}
void qRotate;
void v3;

// ------------------------------------------------------------------------------------ scripts

const CAR_HEAD = `using UnityEngine;

public class Car : MonoBehaviour
{`;
export const RACE_OFFICIAL = {
  car: `using UnityEngine;

public class Car : MonoBehaviour
{
    public float acceleration = 14f;
    public float maxSpeed = 32f;
    public float turnSpeed = 60f;
    public float drag = 0.25f;
    public float brakeForce = 30f;
    public float grassSpeed = 12f;
    float speed;

    void Update()
    {
        float gas = Input.GetAxis("Vertical");
        float steer = Input.GetAxis("Horizontal");

        if (gas < 0 && speed > 0) speed -= brakeForce * Time.deltaTime;
        else speed += gas * acceleration * Time.deltaTime;
        speed -= speed * drag * Time.deltaTime;

        float limit = OnRoad() ? maxSpeed : grassSpeed;
        if (speed > limit) speed = Mathf.MoveTowards(speed, limit, 25f * Time.deltaTime);
        speed = Mathf.Max(speed, -5f);

        transform.Rotate(0, steer * turnSpeed * Time.deltaTime * Mathf.Clamp01(Mathf.Abs(speed) / 8f), 0);
        transform.position += transform.forward * speed * Time.deltaTime;
    }

    bool OnRoad()
    {
        return Physics.Raycast(transform.position, Vector3.down, out RaycastHit hit, 3f) && hit.collider.CompareTag("Road");
    }

    void OnCollisionEnter(Collision collision)
    {
        speed *= 0.4f;
    }
}
`,
  lap: `using UnityEngine;
using TMPro;

public class LapTimer : MonoBehaviour
{
    public TMP_Text lapText;
    public int checkpoints = 3;
    public int laps = 0;
    int next = 0;
    float lapStart;
    float bestLap = 9999f;

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Checkpoint") && other.name == "CP" + next)
            next++;

        if (other.CompareTag("Finish") && next == checkpoints)
        {
            float lap = Time.time - lapStart;
            if (lap < bestLap) bestLap = lap;
            laps++;
            lapStart = Time.time;
            next = 0;
            lapText.text = "${tr('Lap', 'Круг')} " + laps + ": " + lap.ToString("F1") + " ${tr('s · best', 'с · лучший')} " + bestLap.ToString("F1");
        }
    }
}
`,
  ai: `using UnityEngine;

public class AIDriver : MonoBehaviour
{
    public float speed = 19f;
    public float turn = 140f;
    public float sensorLength = 20f;

    void Update()
    {
        Vector3 eye = transform.position + Vector3.up * 0.3f;
        float left = Sense(eye, Quaternion.Euler(0, -35, 0) * transform.forward);
        float right = Sense(eye, Quaternion.Euler(0, 35, 0) * transform.forward);
        float steer = (right - left) / sensorLength;
        transform.Rotate(0, steer * turn * Time.deltaTime, 0);
        transform.position += transform.forward * speed * Time.deltaTime;
    }

    float Sense(Vector3 from, Vector3 dir)
    {
        if (Physics.Raycast(from, dir, out RaycastHit hit, sensorLength)) return hit.distance;
        return sensorLength;
    }
}
`,
};
const official = (...k: (keyof typeof RACE_OFFICIAL)[]) => k.map((x) => ({ source: RACE_OFFICIAL[x], on: 'Player' }));

const aiCar = (name: string, frac: number, lateral: number, color: string, extra: Partial<Spec3> = {}): Spec3 => {
  const t = trackAt(frac);
  const yaw = (t.yaw * Math.PI) / 180;
  return { name, tag: 'AI', shape: 'car', pos: [t.x + Math.cos(yaw) * lateral, 0.65, t.z - Math.sin(yaw) * lateral], rot: [0, t.yaw, 0], size: [1.9, 1.3, 4.3], color, ...extra };
};

// ------------------------------------------------------------------------------------ lessons

const KEYS = ['W', 'A/D', 'S'];

export const RACE_MISSIONS: Mission[] = [
  {
    id: 'r1',
    chapter: 1,
    icon: '⛽',
    title: T('Gas', 'Газ'),
    system: T('Engine', 'Мотор'),
    radio: T('Welcome to the track! A car is speed that grows while you press the gas. Every frame: speed += acceleration × time, and the car moves forward by speed × time.', 'Добро пожаловать на трассу! Машина — это скорость, которая растёт, пока жмёшь газ. Каждый кадр: скорость += ускорение × время, и машина едет вперёд на скорость × время.'),
    task: T('Fill the blanks and reach 90 km/h on the straight (W).', 'Заполни пропуски и разгонись до 90 км/ч на прямой (W).'),
    words: [
      { word: 'speed', say: T('How fast the car goes now, metres per second (×3.6 = km/h).', 'Насколько быстро машина едет сейчас, м/с (×3,6 = км/ч).') },
      { word: 'Mathf.Clamp', say: T('Keeps the speed between a minimum and a maximum.', 'Держит скорость между минимумом и максимумом.') },
    ],
    hints: [T('speed grows by gas × acceleration; limit with maxSpeed; move by speed.', 'speed растёт на gas × acceleration; ограничь maxSpeed; двигайся на speed.'), T('acceleration, maxSpeed, speed', 'acceleration, maxSpeed, speed')],
    code: () => `${CAR_HEAD}
    public float acceleration = 14f;
    public float maxSpeed = 32f;
    float speed;

    void Update()
    {
        float gas = Input.GetAxis("Vertical");
        speed += gas * ⟦acceleration⟧ * Time.deltaTime;
        speed = Mathf.Clamp(speed, -5f, ⟦maxSpeed⟧);
        transform.position += transform.forward * ⟦speed⟧ * Time.deltaTime;
    }
}
`,
    file: 'Car.cs',
    level: () => raceLevel('r1'),
    goals: [{ text: T('Reach 90 km/h', 'Разгонись до 90 км/ч'), check: (w, r) => sticky(r, 'v', kmh(w) >= 90) }],
    keys: ['W'],
    ability: T('The engine works: W — gas.', 'Мотор работает: W — газ.'),
    inUnity: T('Make a box (the car) and put this script on it. Real games often use a Rigidbody and AddForce, but a simple speed number is how most arcade racers start.', 'Сделай куб (машину) и повесь скрипт. В настоящих играх часто используют Rigidbody и AddForce, но простое число скорости — так начинается большинство аркадных гонок.'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 5,
  },
  {
    id: 'r2',
    chapter: 1,
    icon: '🛞',
    title: T('Steering', 'Руль'),
    system: T('Steering', 'Руль'),
    radio: T('Now turn. A real car cannot turn standing still: the faster it rolls, the more it turns (up to a limit). Rotate around the vertical axis.', 'Теперь поворачиваем. Настоящая машина не поворачивает на месте: чем быстрее катится, тем сильнее поворачивает (до предела). Вращаем вокруг вертикальной оси.'),
    task: T('Fill the blanks and drive through the first quarter of the lap (A/D steer).', 'Заполни пропуски и проедь первую четверть круга (A/D — руль).'),
    words: [{ word: 'Mathf.Clamp01(x)', say: T('Keeps x between 0 and 1: slow → turns less.', 'Держит x между 0 и 1: медленно → поворачивает меньше.') }],
    hints: [T('steer = "Horizontal"; Rotate(0, steer × turnSpeed × …, 0).', 'steer = "Horizontal"; Rotate(0, steer × turnSpeed × …, 0).'), T('"Horizontal", turnSpeed', '"Horizontal", turnSpeed')],
    code: () => `${CAR_HEAD}
    public float acceleration = 14f;
    public float maxSpeed = 26f;
    public float turnSpeed = 60f;
    float speed;

    void Update()
    {
        float gas = Input.GetAxis("Vertical");
        float steer = Input.GetAxis(⟦"Horizontal"⟧);
        speed += gas * acceleration * Time.deltaTime;
        speed = Mathf.Clamp(speed, -5f, maxSpeed);

        transform.Rotate(0, steer * ⟦turnSpeed⟧ * Time.deltaTime * Mathf.Clamp01(speed / 8f), 0);
        transform.position += transform.forward * speed * Time.deltaTime;
    }
}
`,
    file: 'Car.cs',
    level: () => raceLevel('r2', { objects: [GATE('Quarter', 'Zone', 0.26)] }),
    goals: [{ text: T('Drive a quarter of the lap', 'Проедь четверть круга'), check: (w, r) => sticky(r, 'q', passedFrac(w, r, 'Player', 0.26)) }],
    keys: ['W', 'A/D'],
    ability: T('You can steer.', 'Ты умеешь рулить.'),
    inUnity: T('In Unity the same Rotate works. Wheel colliders are the "real" way, but they need a lot of tuning — arcade first!', 'В Unity тот же Rotate работает. Wheel Collider — «настоящий» способ, но его долго настраивать — сначала аркада!'),
    demo: (_t, w) => drive(w, { throttle: 0.75 }),
    demoSeconds: 14,
  },
  {
    id: 'r3',
    chapter: 1,
    icon: '🛑',
    title: T('Brakes and air', 'Тормоз и воздух'),
    system: T('Brakes', 'Тормоза'),
    radio: T('Two forces slow a car: brakes (S) and the air (drag) — the faster you go, the harder the air pushes back. Without them a car never stops: it would roll forever.', 'Машину замедляют две силы: тормоз (S) и воздух (сопротивление) — чем быстрее едешь, тем сильнее давит воздух. Без них машина не остановится никогда: катилась бы вечно.'),
    task: T('Fill the blanks. Release the gas — the car slows by itself; then stop inside the pit box.', 'Заполни пропуски. Отпусти газ — машина сама замедлится; потом остановись в боксе.'),
    words: [
      { word: 'drag', say: T('Air resistance: speed −= speed × drag × time.', 'Сопротивление воздуха: speed −= speed × drag × время.') },
      { word: 'else', say: T('"otherwise": brake OR accelerate, not both.', '«иначе»: тормозим ИЛИ разгоняемся, не вместе.') },
    ],
    hints: [T('Brake with brakeForce; drag multiplies speed by drag.', 'Тормози через brakeForce; сопротивление умножает speed на drag.'), T('brakeForce, drag', 'brakeForce, drag')],
    code: () => `${CAR_HEAD}
    public float acceleration = 14f;
    public float maxSpeed = 32f;
    public float turnSpeed = 60f;
    public float drag = 0.25f;
    public float brakeForce = 30f;
    float speed;

    void Update()
    {
        float gas = Input.GetAxis("Vertical");
        float steer = Input.GetAxis("Horizontal");

        if (gas < 0 && speed > 0) speed -= ⟦brakeForce⟧ * Time.deltaTime;
        else speed += gas * acceleration * Time.deltaTime;
        speed -= speed * ⟦drag⟧ * Time.deltaTime;
        speed = Mathf.Clamp(speed, -5f, maxSpeed);

        transform.Rotate(0, steer * turnSpeed * Time.deltaTime * Mathf.Clamp01(Mathf.Abs(speed) / 8f), 0);
        transform.position += transform.forward * speed * Time.deltaTime;
    }
}
`,
    file: 'Car.cs',
    level: () => raceLevel('r3', { objects: [{ ...GATE('PitBox', 'Zone', 0.17, '#3ad1ff'), size: [7, 0.1, 7] }] }),
    goals: [
      { text: T('Release the gas: the car slows down by itself', 'Отпусти газ: машина сама замедляется'), check: (w, r) => {
        const v = kmh(w);
        const coasting = w.keys.size === 0 && v > 40;
        if (coasting && r.mem.coastV !== undefined && r.mem.coastV - v > 0.08) r.mem.slowFrames = (r.mem.slowFrames ?? 0) + 1;
        r.mem.coastV = coasting ? v : undefined;
        return sticky(r, 'drag', (r.mem.slowFrames ?? 0) > 20);
      } },
      { text: T('Stop inside the pit box', 'Остановись в боксе'), check: (w, r) => {
        const z = objByName(w, 'PitBox');
        if (!z) return false;
        const inside = Math.hypot(w.player.pos.x - z.pos.x, w.player.pos.z - z.pos.z) < 3.5;
        if (inside && kmh(w) < 3) z.color = '#3ad17a';
        return sticky(r, 'stop', inside && kmh(w) < 3);
      } },
    ],
    keys: KEYS,
    ability: T('Brakes: S. The car slows by itself in the air.', 'Тормоз: S. Машина сама сбавляет на воздухе.'),
    inUnity: T('Rigidbody.drag in Unity is exactly this "air resistance" number.', 'Rigidbody.drag в Unity — это ровно это число «сопротивления воздуха».'),
    demo: (t, w) => {
      if (t < 2.4) return { until: 1e9, keys: ['w'] };
      if (t < 3.6) return { until: 1e9 };
      const z = objByName(w, 'PitBox')!;
      const ahead = w.trackInfo(z.pos).along - w.trackInfo(w.player.pos).along;
      const v = Math.hypot(w.player.vel.x, w.player.vel.z);
      // brake when the stopping distance (v² / 2a) reaches the box
      return { until: 1e9, keys: ahead < (v * v) / 50 + 1 ? (v > 0.3 ? ['s'] : []) : ['w'] };
    },
    demoSeconds: 14,
  },
  {
    id: 'r4',
    chapter: 1,
    icon: '🌱',
    title: T('Grass', 'Трава'),
    system: T('Surface', 'Покрытие'),
    radio: T('On grass a car is slow. How does it know? Shoot a ray down: what is under me — "Road" or "Grass"?', 'По траве машина едет медленно. Как она узнаёт? Пусти луч вниз: что подо мной — «Road» или «Grass»?'),
    task: T('Fill the blanks, drive onto the grass: the car must slow down to the grass speed.', 'Заполни пропуски, съедь на траву: машина должна сбросить до травяной скорости.'),
    words: [{ word: 'Vector3.down', say: T('A ray straight down — what am I standing on?', 'Луч прямо вниз — на чём я стою?') }],
    hints: [T('Ray down, tag "Road". On grass the limit is grassSpeed.', 'Луч вниз, тег "Road". На траве предел — grassSpeed.'), T('down, "Road", grassSpeed', 'down, "Road", grassSpeed')],
    code: () => `${CAR_HEAD}
    public float acceleration = 14f;
    public float maxSpeed = 32f;
    public float turnSpeed = 60f;
    public float drag = 0.25f;
    public float grassSpeed = 12f;
    float speed;

    void Update()
    {
        float gas = Input.GetAxis("Vertical");
        float steer = Input.GetAxis("Horizontal");
        speed += gas * acceleration * Time.deltaTime;
        speed -= speed * drag * Time.deltaTime;

        float limit = OnRoad() ? maxSpeed : ⟦grassSpeed⟧;
        if (speed > limit) speed = Mathf.MoveTowards(speed, limit, 25f * Time.deltaTime);

        transform.Rotate(0, steer * turnSpeed * Time.deltaTime * Mathf.Clamp01(Mathf.Abs(speed) / 8f), 0);
        transform.position += transform.forward * speed * Time.deltaTime;
    }

    bool OnRoad()
    {
        return Physics.Raycast(transform.position, Vector3.⟦down⟧, out RaycastHit hit, 3f) && hit.collider.CompareTag(⟦"Road"⟧);
    }
}
`,
    file: 'Car.cs',
    level: () => raceLevel('r4'),
    goals: [
      { text: T('Drive onto the grass', 'Съедь на траву'), check: (w, r) => {
        const lat = Math.abs(w.trackInfo(w.player.pos).lateral);
        if (lat > TRACK.width / 2 + 1) r.mem.onGrass = (r.mem.onGrass ?? 0) + w.dt;
        else r.mem.onGrass = 0;
        return sticky(r, 'g', r.mem.onGrass > 0.2);
      } },
      { text: T('…the car slows to the grass speed (≤ 47 km/h)', '…машина сбросила до травяной скорости (≤ 47 км/ч)'), check: (w, r) => {
        const lat = Math.abs(w.trackInfo(w.player.pos).lateral);
        r.mem.grassTime = lat > TRACK.width / 2 + 1 ? (r.mem.grassTime ?? 0) + w.dt : 0;
        return sticky(r, 'slow', r.mem.grassTime > 1.2 && kmh(w) <= 47 && w.keys.has('w'));
      } },
    ],
    keys: KEYS,
    ability: T('The car feels the ground: grass slows it.', 'Машина чувствует покрытие: трава тормозит.'),
    inUnity: T('Real games give each surface a friction: ice, sand, mud. The same ray down tells which one.', 'В настоящих играх у каждого покрытия своё трение: лёд, песок, грязь. Тот же луч вниз говорит, какое.'),
    demo: (t, w) => (t < 2 ? { until: 1e9, keys: ['w'] } : t < 2.6 ? { until: 1e9, keys: ['w', 'd'] } : t < 3 ? { until: 1e9, keys: ['w', 'a'] } : Math.abs(w.trackInfo(w.player.pos).lateral) < TRACK.width / 2 + 1.5 ? { until: 1e9, keys: ['w', 'd'] } : { until: 1e9, keys: ['w'] }),
    demoSeconds: 7,
  },
  {
    id: 'r5',
    chapter: 1,
    icon: '🧱',
    title: T('Crash', 'Удар'),
    system: T('Collisions', 'Столкновения'),
    radio: T('When the car hits a barrier, Unity calls OnCollisionEnter and tells how hard. A hit must cost speed — or the car glides along the wall like soap.', 'Когда машина врезается в бортик, Unity вызывает OnCollisionEnter и говорит, насколько сильно. Удар должен отнимать скорость — иначе машина скользит вдоль стены, как мыло.'),
    task: T('Fill the blanks and drive straight into the first turn: the hit must slow you down.', 'Заполни пропуски и въедь прямо в первый поворот: удар должен тебя замедлить.'),
    words: [
      { word: 'OnCollisionEnter(Collision c)', say: T('Called once at the moment of a hit.', 'Вызывается один раз в момент удара.') },
      { word: 'c.relativeVelocity.magnitude', say: T('How hard the hit was (speed into the wall).', 'Насколько сильным был удар (скорость в стену).') },
    ],
    hints: [T('speed *= 0.4f; print the magnitude.', 'speed *= 0.4f; выведи magnitude.'), T('0.4f, magnitude', '0.4f, magnitude')],
    code: () => `${RACE_OFFICIAL.car.replace(`    void OnCollisionEnter(Collision collision)
    {
        speed *= 0.4f;
    }`, `    void OnCollisionEnter(Collision collision)
    {
        speed *= ⟦0.4f⟧;
        Debug.Log("${tr('Hit! Strength: ', 'Удар! Сила: ')}" + collision.relativeVelocity.⟦magnitude⟧);
    }`)}`,
    file: 'Car.cs',
    level: () => raceLevel('r5'),
    goals: [
      { text: T('Hit the barrier', 'Врежься в бортик'), check: (w, r) => {
        if (w.lastCollision?.obj === w.player && r.mem.hitAt === undefined) {
          r.mem.hitAt = w.time;
          r.mem.before = r.mem.lastV ?? 0;
        }
        r.mem.lastV = kmh(w);
        return r.mem.hitAt !== undefined && logged(w, /Hit!|Удар!/);
      } },
      { text: T('…and lose more than 40% of the speed', '…и потеряй больше 40% скорости'), check: (w, r) => r.mem.hitAt !== undefined && w.time - r.mem.hitAt < 0.3 && w.time - r.mem.hitAt > 0.05 && kmh(w) < r.mem.before * 0.6 },
    ],
    keys: KEYS,
    ability: T('Crashes cost speed — driving clean matters.', 'Удары отнимают скорость — важно ехать чисто.'),
    inUnity: T('Unity calls OnCollisionEnter on a Rigidbody with a collider. Use collision.relativeVelocity for damage, sounds and sparks.', 'Unity вызывает OnCollisionEnter у Rigidbody с коллайдером. collision.relativeVelocity — для урона, звуков и искр.'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 8,
  },
  {
    id: 'r6',
    chapter: 2,
    icon: '⏱',
    title: T('A lap and its time', 'Круг и время'),
    system: T('Lap timer', 'Секундомер'),
    radio: T('A race is laps. Gates (checkpoints) stop cutting corners: a lap counts only if you passed CP0, CP1, CP2 in order and then the finish. Time = Time.time now − at the start of the lap.', 'Гонка — это круги. Ворота (чекпоинты) не дают срезать: круг засчитывается, только если проехал CP0, CP1, CP2 по порядку и потом финиш. Время = Time.time сейчас − в начале круга.'),
    task: T('Fill the blanks and drive one full lap — the time appears on the screen.', 'Заполни пропуски и проедь полный круг — время появится на экране.'),
    words: [
      { word: 'OnTriggerEnter(Collider other)', say: T('Called when the car drives into a gate (a trigger).', 'Вызывается, когда машина въезжает в ворота (триггер).') },
      { word: '"CP" + next', say: T('The name of the next gate: CP0, CP1…', 'Имя следующих ворот: CP0, CP1…') },
      { word: 'ToString("F1")', say: T('A number with one digit after the point: 42.3', 'Число с одной цифрой после точки: 42.3') },
    ],
    hints: [T('Gate name "CP" + next; time Time.time − lapStart; when better — bestLap = lap.', 'Имя ворот "CP" + next; время Time.time − lapStart; лучше — bestLap = lap.'), T('next, lapStart, lap', 'next, lapStart, lap')],
    code: () => RACE_OFFICIAL.lap.replace('other.name == "CP" + next', 'other.name == "CP" + ⟦next⟧').replace('float lap = Time.time - lapStart;', 'float lap = Time.time - ⟦lapStart⟧;').replace('if (lap < bestLap) bestLap = lap;', 'if (lap < bestLap) bestLap = ⟦lap⟧;'),
    file: 'LapTimer.cs',
    level: () => raceLevel('r6', { objects: CHECKPOINTS(), scripts: official('car') }),
    goals: [
      { text: T('Drive a full lap through all gates', 'Проедь полный круг через все ворота'), check: (w) => num(field(w, 'laps')) >= 1 },
      { text: T('The lap time is on the screen', 'Время круга на экране'), check: (w) => w.ui.some((u) => /\d+\.\d/.test(u.text)) },
    ],
    keys: KEYS,
    ability: T('Laps are timed. The best one is remembered.', 'Круги на время. Лучший запоминается.'),
    inUnity: T('Checkpoints are boxes with "Is Trigger" on and a tag. In Unity the car needs a Rigidbody for triggers to work.', 'Чекпоинты — это кубы с галочкой «Is Trigger» и тегом. В Unity машине нужен Rigidbody, чтобы триггеры срабатывали.'),
    demo: (_t, w) => drive(w),
    demoSeconds: 40,
  },
  {
    id: 'r7',
    chapter: 2,
    icon: '👻',
    title: T('The ghost', 'Призрак'),
    system: T('Ghost', 'Призрак'),
    radio: T('Like in Trackmania: drive a lap, and on the next lap your best run drives next to you as a ghost. Record position and rotation every frame; replay them. Close to you the ghost is see-through, far away — clearly visible.', 'Как в Trackmania: проехал круг — и на следующем твой лучший заезд едет рядом призраком. Записываем положение и поворот каждый кадр; потом проигрываем. Рядом с тобой призрак прозрачный, вдали — хорошо виден.'),
    task: T('Fill the blanks. Drive 2 laps: on the 2nd your ghost races you.', 'Заполни пропуски. Проедь 2 круга: на втором с тобой едет твой призрак.'),
    words: [
      { word: 'List<Vector3>', say: T('A growing list of points — the recorded path.', 'Растущий список точек — записанный путь.') },
      { word: 'new List<Vector3>(rec)', say: T('A copy of the list (the best lap is kept, recording starts again).', 'Копия списка (лучший круг сохраняем, запись начинаем заново).') },
      { word: 'Color(r, g, b, alpha)', say: T('alpha = how solid: 0 invisible, 1 solid.', 'alpha — насколько плотный: 0 невидимый, 1 сплошной.') },
    ],
    hints: [T('Replay bestPos[i]; copy recPos; alpha grows with the distance d.', 'Проигрывай bestPos[i]; копируй recPos; alpha растёт с расстоянием d.'), T('i, recPos, alpha', 'i, recPos, alpha')],
    code: () => `using System.Collections.Generic;
using UnityEngine;

public class GhostRecorder : MonoBehaviour
{
    public Transform ghost;
    List<Vector3> recPos = new List<Vector3>();
    List<Quaternion> recRot = new List<Quaternion>();
    List<Vector3> bestPos = new List<Vector3>();
    List<Quaternion> bestRot = new List<Quaternion>();
    int frame;

    void Update()
    {
        recPos.Add(transform.position);
        recRot.Add(transform.rotation);

        if (bestPos.Count > 0)
        {
            int i = Mathf.Min(frame, bestPos.Count - 1);
            ghost.position = bestPos[⟦i⟧];
            ghost.rotation = bestRot[i];
            frame++;

            float d = Vector3.Distance(transform.position, ghost.position);
            float alpha = Mathf.Lerp(0.15f, 0.85f, d / 20f);
            ghost.GetComponent<Renderer>().material.color = new Color(1f, 1f, 1f, ⟦alpha⟧);
        }
    }

    void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Finish") && recPos.Count > 120)
        {
            bestPos = new List<Vector3>(⟦recPos⟧);
            bestRot = new List<Quaternion>(recRot);
            recPos.Clear();
            recRot.Clear();
            frame = 0;
        }
    }
}
`,
    file: 'GhostRecorder.cs',
    level: () => raceLevel('r7', { objects: [...CHECKPOINTS(), { ...aiCar('Ghost', 0.012, 0, '#ffffff'), tag: 'Ghost', ghost: true, opacity: 0 }], scripts: official('car', 'lap') }),
    goals: [
      { text: T('The ghost drives your last lap', 'Призрак едет твоим прошлым кругом'), check: (w, r) => {
        const g = objByName(w, 'Ghost');
        if (!g) return false;
        const moved = r.mem.gx !== undefined ? Math.hypot(g.pos.x - r.mem.gx, g.pos.z - r.mem.gz) : 0;
        r.mem.gx = g.pos.x;
        r.mem.gz = g.pos.z;
        r.mem.gDist = (r.mem.gDist ?? 0) + (moved < 5 ? moved : 0);
        return sticky(r, 'ghost', r.mem.gDist > 80);
      } },
      { text: T('Close — see-through, far — clearly visible', 'Рядом — прозрачный, вдали — хорошо виден'), check: (w, r) => {
        const g = objByName(w, 'Ghost');
        if (!g || r.mem.ghost !== 1) return false;
        const d = Math.hypot(g.pos.x - w.player.pos.x, g.pos.z - w.player.pos.z);
        if (d < 4 && (g.opacity ?? 1) < 0.35) r.mem.nearOk = 1;
        if (d > 14 && (g.opacity ?? 0) > 0.6) r.mem.farOk = 1;
        return r.mem.nearOk === 1 && r.mem.farOk === 1;
      } },
    ],
    keys: KEYS,
    ability: T('Your best lap races you as a ghost.', 'Твой лучший круг едет с тобой призраком.'),
    inUnity: T('For a ghost in Unity: a copy of the car model without colliders and a transparent material (Rendering Mode: Fade).', 'Для призрака в Unity: копия модели машины без коллайдеров и прозрачный материал (Rendering Mode: Fade).'),
    demo: (_t, w, r) => {
      // the second lap a bit slower, so the ghost pulls away and comes back
      const lap2 = num(field(w, 'laps')) >= 1;
      r.mem.l2 = lap2 ? 1 : 0;
      return drive(w, { throttle: lap2 ? 0.6 : 1 });
    },
    demoSeconds: 80,
  },
  {
    id: 'r8',
    chapter: 2,
    icon: '🎨',
    title: T('Paint', 'Покраска'),
    system: T('Paint shop', 'Покрасочная'),
    radio: T('Your car, your colour. A colour can be picked by hue — a circle of colours from 0 (red) to 1 (red again): 0.33 is green, 0.6 is blue.', 'Твоя машина — твой цвет. Цвет удобно выбирать по оттенку (hue) — кругу цветов от 0 (красный) до 1 (снова красный): 0,33 — зелёный, 0,6 — синий.'),
    task: T('Fill the blanks: paint the car in your colour (not red).', 'Заполни пропуски: покрась машину в свой цвет (не красный).'),
    words: [{ word: 'Color.HSVToRGB(hue, saturation, brightness)', say: T('A colour from hue (0–1), how rich (0–1) and how bright (0–1).', 'Цвет из оттенка (0–1), насыщенности (0–1) и яркости (0–1).') }],
    hints: [T('GetComponent<Renderer>().material.color = Color.HSVToRGB(hue, …)', 'GetComponent<Renderer>().material.color = Color.HSVToRGB(hue, …)'), T('Renderer, hue', 'Renderer, hue')],
    code: () => `using UnityEngine;

public class CarPaint : MonoBehaviour
{
    public float hue = 0.58f;
    public float saturation = 0.8f;
    public float brightness = 0.95f;

    void Update()
    {
        Color paint = Color.HSVToRGB(⟦hue⟧, saturation, brightness);
        GetComponent<⟦Renderer⟧>().material.color = paint;
    }
}
`,
    file: 'CarPaint.cs',
    level: () => raceLevel('r8', { scripts: official('car') }),
    goals: [{ text: T('The car has your colour (not the factory red)', 'У машины твой цвет (не заводской красный)'), check: (w) => w.player.color !== '#e8483b' && /^#[0-9a-f]{6}$/.test(w.player.color) }],
    keys: KEYS,
    ability: T('Paint shop: any colour, even while driving (move "hue" in the Inspector!).', 'Покрасочная: любой цвет, даже на ходу (подвигай «hue» в Inspector!).'),
    inUnity: T('In Unity material.color creates a copy of the material for this car — so every car can have its own colour.', 'В Unity material.color делает копию материала для этой машины — поэтому у каждой машины может быть свой цвет.'),
    demo: (_t, w) => drive(w, { throttle: 0.6 }),
    demoSeconds: 2,
  },
  {
    id: 'r9',
    chapter: 3,
    icon: '🔨',
    title: T('Dents', 'Вмятины'),
    system: T('Soft body', 'Мягкий кузов'),
    radio: T('BeamNG cars crumple. The body is a mesh — a net of points (vertices). On a hit, push the points near the hit inwards: the closer, the deeper. That is a dent.', 'Машины в BeamNG сминаются. Кузов — это сетка из точек (вершин). При ударе вдавливаем точки рядом с местом удара: чем ближе, тем глубже. Это и есть вмятина.'),
    task: T('Fill the blanks and crash into the barrier: the body must dent where it was hit.', 'Заполни пропуски и врежься в бортик: кузов должен смяться там, где был удар.'),
    words: [
      { word: 'mesh.vertices', say: T('All the points of the body, in the car\'s own coordinates.', 'Все точки кузова, в координатах самой машины.') },
      { word: 'InverseTransformPoint', say: T('A world point → the car\'s own coordinates.', 'Точка мира → координаты самой машины.') },
      { word: 'for (…; i < v.Length; i++)', say: T('Go through every point of the body.', 'Пройтись по каждой точке кузова.') },
    ],
    hints: [T('The closer the point (d < radius), the deeper: (radius − d) × strength; put the array back into mesh.vertices.', 'Чем ближе точка (d < radius), тем глубже: (radius − d) × strength; верни массив в mesh.vertices.'), T('radius, normal, v', 'radius, normal, v')],
    code: () => `using UnityEngine;

public class Damage : MonoBehaviour
{
    public float radius = 1.2f;
    public float strength = 0.04f;

    void OnCollisionEnter(Collision collision)
    {
        MeshFilter mf = GetComponent<MeshFilter>();
        Vector3[] v = mf.mesh.vertices;
        Vector3 hit = transform.InverseTransformPoint(collision.GetContact(0).point);
        Vector3 push = transform.InverseTransformDirection(collision.GetContact(0).normal);
        float power = collision.relativeVelocity.magnitude;

        for (int i = 0; i < v.Length; i++)
        {
            float d = Vector3.Distance(v[i], hit);
            if (d < ⟦radius⟧)
                v[i] = v[i] + ⟦push⟧ * (radius - d) / radius * strength * power;
        }
        mf.mesh.vertices = ⟦v⟧;
        mf.mesh.RecalculateNormals();
    }
}
`,
    file: 'Damage.cs',
    level: () => raceLevel('r9', { scripts: official('car') }),
    goals: [
      { text: T('The body is dented (deeper than 15 cm)', 'Кузов смят (глубже 15 см)'), check: (w) => maxDent(w) > 0.15 },
      { text: T('…only near the hit, not everywhere', '…только у места удара, а не везде'), check: (w) => maxDent(w) > 0.15 && dentedShare(w) < 0.35 },
    ],
    keys: KEYS,
    ability: T('Crashes leave dents.', 'Удары оставляют вмятины.'),
    inUnity: T('In Unity: GetComponent<MeshFilter>().mesh — the same code works (keep the original vertices to "repair" the car). BeamNG goes further: hundreds of points joined by springs.', 'В Unity: GetComponent<MeshFilter>().mesh — тот же код работает (сохрани исходные вершины, чтобы «чинить» машину). BeamNG идёт дальше: сотни точек, соединённых пружинами.'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 8,
  },
  {
    id: 'r10',
    chapter: 3,
    icon: '🛞',
    title: T('Parts fly off', 'Детали отлетают'),
    system: T('Breakable parts', 'Отрывные детали'),
    radio: T('A hard hit and the bumper flies away! Detach it from the car (SetParent(null)), give it physics (Rigidbody) and a push — gravity does the rest.', 'Сильный удар — и бампер улетает! Отцепи его от машины (SetParent(null)), дай ему физику (Rigidbody) и толчок — остальное сделает гравитация.'),
    task: T('Fill the blanks and hit the barrier hard: the bumper must fall off and land.', 'Заполни пропуски и сильно ударься о бортик: бампер должен отлететь и упасть.'),
    words: [
      { word: 'SetParent(null)', say: T('The part is no longer attached — it lives on its own.', 'Деталь больше не прикреплена — живёт сама по себе.') },
      { word: 'AddComponent<Rigidbody>()', say: T('Give physics: gravity, falling, bouncing.', 'Дать физику: гравитация, падение, отскок.') },
    ],
    hints: [T('Only if power > breakSpeed; SetParent(null); AddComponent<Rigidbody>().', 'Только если power > breakSpeed; SetParent(null); AddComponent<Rigidbody>().'), T('breakSpeed, null, Rigidbody', 'breakSpeed, null, Rigidbody')],
    code: () => `using UnityEngine;

public class Breakable : MonoBehaviour
{
    public float breakSpeed = 8f;
    bool broken = false;

    void OnCollisionEnter(Collision collision)
    {
        float power = collision.relativeVelocity.magnitude;
        if (!broken && power > ⟦breakSpeed⟧)
        {
            broken = true;
            Transform bumper = transform.Find("Bumper");
            bumper.SetParent(⟦null⟧);
            Rigidbody rb = bumper.gameObject.AddComponent<⟦Rigidbody⟧>();
            rb.velocity = transform.forward * 6f + Vector3.up * 4f;
            rb.angularVelocity = new Vector3(5f, 2f, 0);
        }
    }
}
`,
    file: 'Breakable.cs',
    level: () => raceLevel('r10', { scripts: official('car') }),
    goals: [
      { text: T('The bumper came off', 'Бампер оторвался'), check: (w) => !objByName(w, 'Bumper')?.parent },
      { text: T('…and fell to the ground', '…и упал на землю'), check: (w) => {
        const b = objByName(w, 'Bumper');
        return !!b && !b.parent && b.pos.y < 0.4 && Math.hypot(b.pos.x - w.player.pos.x, b.pos.z - w.player.pos.z) > 1.5;
      } },
    ],
    keys: KEYS,
    ability: T('Parts break off on hard hits.', 'Детали отрываются от сильных ударов.'),
    inUnity: T('In Unity the bumper is a child object with its own mesh. Add a collider to it so it bounces on the road.', 'В Unity бампер — дочерний объект со своим мешем. Добавь ему коллайдер, чтобы он отскакивал от дороги.'),
    demo: () => ({ until: 1e9, keys: ['w'] }),
    demoSeconds: 9,
  },
  {
    id: 'r11',
    chapter: 4,
    icon: '📡',
    title: T('Autopilot', 'Автопилот'),
    system: T('AI: sensors', 'ИИ: датчики'),
    radio: T('A car that drives itself has "eyes": rays to the left and right. If the wall on the right is further, turn right. That simple rule drives a whole lap!', 'У машины, которая едет сама, есть «глаза»: лучи влево и вправо. Если справа стена дальше — поворачивай вправо. Это простое правило проезжает целый круг!'),
    task: T('Fill the blanks: the AI car (blue) must drive a full lap by itself.', 'Заполни пропуски: машина ИИ (синяя) должна сама проехать полный круг.'),
    words: [
      { word: 'Quaternion.Euler(0, -35, 0) * forward', say: T('Forward turned 35° to the left — the direction of the left sensor.', 'Вперёд, повёрнутое на 35° влево, — направление левого датчика.') },
      { word: 'hit.distance', say: T('How far the wall is along the ray.', 'Как далеко стена по этому лучу.') },
    ],
    hints: [T('steer = (right − left) / sensorLength; turn by turn; return hit.distance or sensorLength.', 'steer = (right − left) / sensorLength; поворот на turn; верни hit.distance или sensorLength.'), T('right, turn, distance, sensorLength', 'right, turn, distance, sensorLength')],
    code: () => RACE_OFFICIAL.ai
      .replace('float steer = (right - left) / sensorLength;', 'float steer = (⟦right⟧ - left) / sensorLength;')
      .replace('transform.Rotate(0, steer * turn * Time.deltaTime, 0);', 'transform.Rotate(0, steer * ⟦turn⟧ * Time.deltaTime, 0);')
      .replace('return hit.distance;', 'return hit.⟦distance⟧;')
      .replace('        return sensorLength;\n    }', '        return ⟦sensorLength⟧;\n    }'),
    file: 'AIDriver.cs',
    attachTo: '#AI',
    level: () => raceLevel('r11', { objects: [aiCar('AI', 0.012, 0, '#2f6fd6')], chase: 'AI', hidePlayer: true }),
    goals: [{ text: T('The AI drives a full lap by itself', 'ИИ сам проехал полный круг'), check: (w, r) => sticky(r, 'lap', passedFrac(w, r, 'AI', 1)) }],
    keys: [],
    ability: T('You built an autopilot.', 'Ты собрал автопилот.'),
    inUnity: T('Self-driving cars in real research start exactly here: distance sensors + a rule. Then the rule is learned instead of written — next lesson!', 'Беспилотники в настоящих исследованиях начинаются ровно так: датчики расстояния + правило. Потом правило не пишут, а обучают — следующий урок!'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 40,
  },
  {
    id: 'r12',
    chapter: 4,
    icon: '🧬',
    title: T('A car that learns', 'Машина учится'),
    system: T('AI: evolution', 'ИИ: эволюция'),
    radio: T('Now nobody writes the numbers. Six cars try random settings; the one that drives furthest "wins", and the next generation is made of small changes of the winner. Watch them get better — that is machine learning (evolution).', 'Теперь числа никто не пишет. Шесть машин пробуют случайные настройки; та, что уехала дальше всех, «побеждает», а следующее поколение — это небольшие изменения победителя. Смотри, как они становятся лучше, — это машинное обучение (эволюция).'),
    task: T('Fill the blanks. Within a few generations the best car must drive at least 220 m.', 'Заполни пропуски. За несколько поколений лучшая машина должна уехать хотя бы на 220 м.'),
    words: [
      { word: 'generation', say: T('One round of tries. Then the best one becomes the parent.', 'Один раунд попыток. Потом лучший становится родителем.') },
      { word: 'mutation', say: T('How much the children differ from the parent (random).', 'Насколько дети отличаются от родителя (случайно).') },
      { word: 'fitness / score', say: T('How good a try was: here — how far it drove.', 'Насколько хороша попытка: здесь — как далеко уехала.') },
    ],
    hints: [T('A child = best ± mutation; score = distance along; the best one is kept.', 'Ребёнок = лучший ± mutation; score = пройденное расстояние; лучшего запоминаем.'), T('mutation, score, turn[i]', 'mutation, score, turn[i]')],
    code: () => `using UnityEngine;
using TMPro;

public class Trainer : MonoBehaviour
{
    public float generationTime = 11f;
    public float mutation = 0.5f;
    public TMP_Text info;
    GameObject[] cars;
    float[] turn;
    float[] speeds;
    float bestTurn = 40f;
    float bestSpeed = 10f;
    float bestScore = 0f;
    float timer;
    int generation = 1;
    Vector3 startPos;
    Quaternion startRot;

    void Start()
    {
        cars = GameObject.FindGameObjectsWithTag("AI");
        turn = new float[cars.Length];
        speeds = new float[cars.Length];
        startPos = cars[0].transform.position;
        startRot = cars[0].transform.rotation;
        NewGeneration();
    }

    void NewGeneration()
    {
        for (int i = 0; i < cars.Length; i++)
        {
            turn[i] = bestTurn * (1f + Random.Range(-1f, 1f) * ⟦mutation⟧);
            speeds[i] = bestSpeed * (1f + Random.Range(-1f, 1f) * mutation);
            if (i == 0) { turn[i] = bestTurn; speeds[i] = bestSpeed; }
            cars[i].transform.position = startPos;
            cars[i].transform.rotation = startRot;
        }
        timer = 0;
    }

    void Update()
    {
        timer += Time.deltaTime;
        for (int i = 0; i < cars.Length; i++)
            Drive(cars[i].transform, turn[i], speeds[i]);

        if (timer > generationTime)
        {
            for (int i = 0; i < cars.Length; i++)
            {
                float score = RaceTrack.DistanceAlong(cars[i].transform.position);
                if (score > ⟦bestScore⟧ && score < RaceTrack.Length * 0.9f)
                {
                    bestScore = score;
                    bestTurn = ⟦turn[i]⟧;
                    bestSpeed = speeds[i];
                }
            }
            generation++;
            info.text = "${tr('Generation', 'Поколение')} " + generation + " · ${tr('best', 'лучший')} " + Mathf.RoundToInt(bestScore) + " ${tr('m', 'м')}";
            NewGeneration();
        }
    }

    void Drive(Transform car, float turnPower, float speed)
    {
        if (Mathf.Abs(RaceTrack.DistanceFromCenter(car.position)) > 9f) return; // crashed — it stays
        Vector3 eye = car.position + Vector3.up * 0.3f;
        float left = Sense(eye, Quaternion.Euler(0, -35, 0) * car.forward);
        float right = Sense(eye, Quaternion.Euler(0, 35, 0) * car.forward);
        car.Rotate(0, (right - left) / 20f * turnPower * Time.deltaTime, 0);
        car.position += car.forward * speed * Time.deltaTime;
    }

    float Sense(Vector3 from, Vector3 dir)
    {
        if (Physics.Raycast(from, dir, out RaycastHit hit, 20f)) return hit.distance;
        return 20f;
    }
}
`,
    file: 'Trainer.cs',
    attachTo: 'Trainer',
    level: () => raceLevel('r12', {
      objects: [{ name: 'Trainer', shape: 'none', pos: [0, 0, 0] }, ...['#2f6fd6', '#e8a33b', '#3bb273', '#9b59d0', '#e8483b', '#20b2c8'].map((c, i) => ({ ...aiCar(`Car${i + 1}`, 0.012, 0, c, { opacity: i === 0 ? 1 : 0.55 }), passThroughCars: true }))],
      chase: 'Car1',
      hidePlayer: true,
    }),
    goals: [
      { text: T('Generations change', 'Поколения сменяются'), check: (w) => w.ui.some((u) => /(Generation|Поколение) [3-9]/.test(u.text)) },
      { text: T('The best car drove at least 220 m', 'Лучшая машина уехала хотя бы на 220 м'), check: (w) => num(field(w, 'bestScore')) >= 220 },
    ],
    keys: [],
    ability: T('You made a car that learns to drive by itself.', 'Ты сделал машину, которая сама учится ездить.'),
    inUnity: T('Unity has ML-Agents for real neural networks. Evolution like this is the easiest way to see the idea: try, score, keep the best, change a little, repeat.', 'В Unity есть ML-Agents для настоящих нейросетей. Эволюция — самый простой способ увидеть идею: попробовать, оценить, оставить лучшего, чуть изменить, повторить.'),
    demo: () => ({ until: 1e9 }),
    demoSeconds: 95,
  },
];

function dents(w: World3D): number[] {
  const m = w.player.mesh;
  if (!m) return [];
  return m.verts.map((v, i) => Math.hypot(v.x - m.base[i].x, v.y - m.base[i].y, v.z - m.base[i].z));
}
const maxDent = (w: World3D) => Math.max(0, ...dents(w));
const dentedShare = (w: World3D) => {
  const d = dents(w);
  return d.filter((x) => x > 0.01).length / Math.max(1, d.length);
};

export const RACE_IDS = new Set(RACE_MISSIONS.map((m) => m.id));

/** Free drive: your finished car with laps, ghost, paint, dents and parts, against 3 AI cars. */
export function raceFreeScripts(): { file: string; on: string; source: string }[] {
  const answer = (id: string) => RACE_MISSIONS.find((m) => m.id === id)!.code().replace(/⟦([^⟧]*)⟧/g, '$1');
  return [
    { file: 'Car.cs', on: 'Player', source: RACE_OFFICIAL.car },
    { file: 'LapTimer.cs', on: 'Player', source: RACE_OFFICIAL.lap },
    { file: 'GhostRecorder.cs', on: 'Player', source: answer('r7') },
    { file: 'CarPaint.cs', on: 'Player', source: answer('r8') },
    { file: 'Damage.cs', on: 'Player', source: answer('r9') },
    { file: 'Breakable.cs', on: 'Player', source: answer('r10') },
    { file: 'AIDriver.cs', on: '#AI', source: RACE_OFFICIAL.ai },
  ];
}
export function raceFreeLevel(scripts: { source: string; on: string }[]): Level3 {
  return raceLevel('race-free', {
    objects: [...CHECKPOINTS(), { ...aiCar('Ghost', 0.012, 0, '#ffffff'), tag: 'Ghost', ghost: true, opacity: 0 }, aiCar('Blue', 0.03, -3, '#2f6fd6'), aiCar('Yellow', 0.05, 3, '#e8a33b'), aiCar('Green', 0.07, -3, '#3bb273')],
    scripts,
  });
}
export { START };
export type { V3 };
