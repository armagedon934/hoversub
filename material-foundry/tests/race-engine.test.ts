// The race part of the 3D engine: a closed track, barriers that push a car back and tell its script
// (OnCollisionEnter), asphalt/grass under the car, helper queries, colours, a body that can be
// dented through mesh.vertices, and parts that fall off.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { World3D, sampleTrack, type Level3 } from '../src/code/run/unity3d';

setLocale('en', false);
const oval = { points: [[0, 0], [0, 60], [20, 80], [40, 60], [40, 0], [20, -20]] as [number, number][], width: 12 };
const level = (extra: Partial<Level3> = {}): Level3 => ({ id: 'r', mode: 'race', track: oval, objects: [], player: { pos: [0, 0.65, 0] }, ...extra });

const DRIVE = `using UnityEngine;
public class Drive : MonoBehaviour
{
    public float speed = 20f;
    public float steer = 0f;
    public int hits = 0;
    public float lastImpact = 0f;
    public string under = "";
    void Update()
    {
        transform.Rotate(0, steer * Time.deltaTime, 0);
        transform.position += transform.forward * speed * Time.deltaTime;
        if (Physics.Raycast(transform.position, Vector3.down, out RaycastHit hit, 3f)) under = hit.collider.tag;
    }
    void OnCollisionEnter(Collision c)
    {
        hits++;
        lastImpact = c.relativeVelocity.magnitude;
        speed = speed * 0.5f;
    }
}`;

describe('race engine', () => {
  it('samples a closed smooth track', () => {
    const t = sampleTrack(oval);
    expect(t.pts.length).toBeGreaterThan(80);
    expect(t.len).toBeGreaterThan(200);
  });
  it('a car driving straight at a curve hits the barrier: pushed back, script told, speed halved', async () => {
    const w = new World3D(level());
    expect(await w.load(DRIVE)).toBeNull();
    w.simulate(1, [{ until: 1e9 }]);
    const f = (n: string) => w.insts[0].self!.fields.get(n)!.v;
    expect(f('under')).toBe('Road');
    w.simulate(5, [{ until: 1e9 }]);
    expect(f('hits')).toBeGreaterThanOrEqual(1);
    expect(f('lastImpact') as number).toBeGreaterThan(1);
    expect(Math.abs(w.trackInfo(w.player.pos).lateral)).toBeLessThan(w.barrierOffset);
  });
  it('helpers: distance along, point ahead, direction', async () => {
    const w = new World3D(level());
    await w.load(`using UnityEngine;
public class Q : MonoBehaviour {
  public float along; public float ahead; public float len;
  void Start() {
    len = RaceTrack.Length;
    along = RaceTrack.DistanceAlong(transform.position);
    Vector3 p = RaceTrack.PointAhead(transform.position, 10f);
    ahead = RaceTrack.DistanceAlong(p);
  }
}`);
    w.simulate(0.05, [{ until: 1e9 }]);
    const f = (n: string) => w.insts[0].self!.fields.get(n)!.v as number;
    expect(f('len')).toBeCloseTo(w.trackLen, 3);
    expect(f('ahead') - f('along')).toBeCloseTo(10, 0);
  });
  it('colours: material.color with alpha makes the car see-through', async () => {
    const w = new World3D(level());
    await w.load(`using UnityEngine;
public class C : MonoBehaviour {
  void Start() { GetComponent<Renderer>().material.color = new Color(0f, 0.5f, 1f, 0.3f); }
}`);
    w.simulate(0.05, [{ until: 1e9 }]);
    expect(w.player.color).toBe('#0080ff');
    expect(w.player.opacity).toBeCloseTo(0.3);
    expect(w.objects.find((o) => o.name === 'Cabin')!.opacity).toBeCloseTo(0.3);
  });
  it('dents: vertices near the hit point move in; a bumper can fall off', async () => {
    const w = new World3D(level());
    await w.load(`using UnityEngine;
public class Crash : MonoBehaviour {
  void Start() {
    MeshFilter mf = GetComponent<MeshFilter>();
    Vector3[] v = mf.mesh.vertices;
    Vector3 hit = transform.InverseTransformPoint(transform.position + transform.forward * 2.2f);
    for (int i = 0; i < v.Length; i++) {
      float d = Vector3.Distance(v[i], hit);
      if (d < 1f) v[i] = v[i] + Vector3.back * (1f - d) * 0.4f;
    }
    mf.mesh.vertices = v;
    Transform bumper = transform.Find("Bumper");
    bumper.SetParent(null);
    Rigidbody rb = bumper.gameObject.AddComponent<Rigidbody>();
    rb.velocity = new Vector3(0, 3, 4);
  }
}`);
    w.simulate(2, [{ until: 1e9 }]);
    const m = w.player.mesh!;
    const moved = m.verts.map((v, i) => Math.hypot(v.x - m.base[i].x, v.y - m.base[i].y, v.z - m.base[i].z));
    expect(Math.max(...moved)).toBeGreaterThan(0.2);
    expect(moved.filter((d) => d > 0.01).length).toBeLessThan(m.verts.length / 3);
    expect(m.version).toBe(1);
    const bumper = w.objects.find((o) => o.name === 'Bumper')!;
    expect(bumper.parent).toBeUndefined();
    expect(bumper.pos.y).toBeLessThan(0.3);
    expect(bumper.pos.z).toBeGreaterThan(4);
  });
  it('a sensor ray from inside the car sees the barrier, not its own bumper', async () => {
    const w = new World3D(level());
    await w.load(`using UnityEngine;
public class S : MonoBehaviour {
  public float front = -1f; public string what = "";
  void Start() {
    if (Physics.Raycast(transform.position + Vector3.up * 0.2f, transform.right, out RaycastHit hit, 40f)) { front = hit.distance; what = hit.collider.tag; }
  }
}`);
    w.simulate(0.05, [{ until: 1e9 }]);
    const f = (n: string) => w.insts[0].self!.fields.get(n)!.v;
    expect(f('what')).toBe('Barrier');
    expect(f('front') as number).toBeGreaterThan(5);
    expect(f('front') as number).toBeLessThan(8);
  });
});
