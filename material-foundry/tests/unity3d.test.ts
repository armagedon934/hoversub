// Mini-Unity 3D: a first-person controller written in real Unity C# moves, looks around with the
// mouse, jumps, shoots with Physics.Raycast(…, out hit) and takes bots down; bots see and shoot back.
import { describe, expect, it } from 'vitest';
import { setLocale } from '../src/code/i18n';
import { World3D, qEuler, qRotate, qToEuler, v3, type Level3 } from '../src/code/run/unity3d';

setLocale('en', false);

const FPS = `using UnityEngine;

public class PlayerController : MonoBehaviour
{
    public float speed = 5f;
    public float mouseSensitivity = 2f;
    public Transform cameraHolder;
    CharacterController controller;
    float pitch;
    float verticalVelocity;

    void Start()
    {
        controller = GetComponent<CharacterController>();
        Cursor.lockState = CursorLockMode.Locked;
    }

    void Update()
    {
        float mx = Input.GetAxis("Mouse X") * mouseSensitivity;
        float my = Input.GetAxis("Mouse Y") * mouseSensitivity;
        transform.Rotate(0, mx, 0);
        pitch = Mathf.Clamp(pitch - my, -80f, 80f);
        cameraHolder.localRotation = Quaternion.Euler(pitch, 0, 0);

        Vector3 move = transform.right * Input.GetAxis("Horizontal") + transform.forward * Input.GetAxis("Vertical");
        controller.Move(move * speed * Time.deltaTime);

        if (controller.isGrounded && verticalVelocity < 0) verticalVelocity = -2f;
        if (Input.GetButtonDown("Jump") && controller.isGrounded) verticalVelocity = 5f;
        verticalVelocity += -9.81f * Time.deltaTime;
        controller.Move(Vector3.up * verticalVelocity * Time.deltaTime);

        if (Input.GetMouseButtonDown(0))
        {
            if (Physics.Raycast(cameraHolder.position, cameraHolder.forward, out RaycastHit hit, 100f))
            {
                Health h = hit.collider.GetComponent<Health>();
                if (h != null) h.TakeDamage(50);
            }
        }
    }
}
`;

const room = (extra: Partial<Level3> = {}): Level3 => ({
  id: 't',
  objects: [],
  player: { pos: [0, 0.9, 0] },
  autoInspector: true,
  ...extra,
});

describe('quaternion maths (Unity conventions)', () => {
  it('Euler(0,90,0) turns forward (0,0,1) into right (1,0,0); pitch down looks down', () => {
    const f = qRotate(qEuler(0, 90, 0), v3(0, 0, 1));
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0);
    const d = qRotate(qEuler(30, 0, 0), v3(0, 0, 1));
    expect(d.y).toBeLessThan(0);
    const e = qToEuler(qEuler(20, 45, 10));
    expect(e.x).toBeCloseTo(20);
    expect(e.y).toBeCloseTo(45);
    expect(e.z).toBeCloseTo(10);
  });
});

describe('Mini-Unity 3D: first-person controller', () => {
  it('walks forward with W, strafes with D, turns with the mouse', async () => {
    const w = new World3D(room());
    expect(await w.load(FPS)).toBeNull();
    let r = w.simulate(1, [{ until: 1e9, keys: ['w'] }]);
    expect(r.status).toBe('playing');
    expect(w.player.pos.z).toBeGreaterThan(4.5);
    expect(w.player.pos.y).toBeCloseTo(0.9, 1);
    expect(w.cursorLocked).toBe(true);
    expect(w.logs.some((l) => /cameraHolder/.test(l.text))).toBe(true);
    // turn 90° right (45 frames × 1px × 2 sensitivity) then walk forward: now we go +x
    r = w.simulate(0.75, [{ until: 1e9, mouse: [1, 0] }]);
    const x0 = w.player.pos.x;
    w.simulate(0.5, [{ until: 1e9, keys: ['w'] }]);
    expect(w.player.pos.x - x0).toBeGreaterThan(2);
    expect(qToEuler(w.player.rot).y).toBeCloseTo(90, 0);
  });

  it('looks up and down with the camera only, clamped to ±80°', async () => {
    const w = new World3D(room());
    await w.load(FPS);
    w.simulate(1, [{ until: 1e9, mouse: [0, 5] }]);
    const pitch = qToEuler(w.camera.rot).x;
    expect(pitch).toBeCloseTo(280, 0); // −80° = looking up
    expect(qToEuler(w.player.rot).x).toBeCloseTo(0);
  });

  it('jumps only from the ground and lands again', async () => {
    const w = new World3D(room());
    await w.load(FPS);
    w.simulate(0.3, [{ until: 1e9 }]);
    let top = 0;
    for (let i = 0; i < 40; i++) {
      w.simulate(1 / 60 + 1e-9, [{ until: 1e9, keys: i < 2 ? [' '] : [] }]);
      top = Math.max(top, w.player.pos.y);
    }
    expect(top).toBeGreaterThan(1.8);
    w.simulate(1.5, [{ until: 1e9 }]);
    expect(w.player.pos.y).toBeCloseTo(0.9, 1);
  });

  it('walls block the controller', async () => {
    const w = new World3D(room({ objects: [{ name: 'Wall', shape: 'box', pos: [0, 1.5, 3], size: [6, 3, 0.5] }] }));
    await w.load(FPS);
    w.simulate(2, [{ until: 1e9, keys: ['w'] }]);
    expect(w.player.pos.z).toBeLessThan(2.5);
  });

  it('shoots a bot twice with Physics.Raycast and takes it down', async () => {
    const w = new World3D(room({ objects: [{ name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 10], rot: [0, 180, 0], bot: { sight: 0.1 } }] }));
    await w.load(FPS);
    const r = w.simulate(1, [
      { until: 0.1, buttons: [0] },
      { until: 0.2 },
      { until: 0.3, buttons: [0] },
      { until: 1e9 },
    ]);
    expect(r.status).toBe('playing');
    expect(w.kills).toBe(1);
    expect(w.logs.some((l) => /Bot is down/.test(l.text))).toBe(true);
  });

  it('a bot that sees the player shoots back and can defeat a passive player', async () => {
    const w = new World3D(room({ player: { pos: [0, 0.9, 0], health: 30 }, objects: [{ name: 'Bot', tag: 'Enemy', shape: 'humanoid', pos: [0, 0.9, 8], rot: [0, 180, 0], bot: { accuracy: 0, fireRate: 0.3, damage: 10 } }] }));
    await w.load(FPS);
    const r = w.simulate(10, [{ until: 1e9 }]);
    expect(r.status).toBe('lost');
  });

  it('patrolling bots walk between waypoints and swing their legs', async () => {
    const w = new World3D(room({ objects: [{ name: 'Bot', shape: 'humanoid', pos: [10, 0.9, 10], bot: { waypoints: [[10, 0.9, 10], [10, 0.9, 16]], sight: 0.1 } }] }));
    await w.load(FPS);
    const bot = w.objects.find((o) => o.name === 'Bot')!;
    let swing = 0;
    for (let i = 0; i < 90; i++) {
      w.simulate(1 / 60 + 1e-9, [{ until: 1e9 }]);
      swing = Math.max(swing, Math.abs(bot.bones!.LeftLeg.local!.rot.x));
    }
    expect(bot.pos.z).toBeGreaterThan(11);
    expect(swing).toBeGreaterThan(0.1);
  });

  it('a null hit gives a clear explanation instead of a crash', async () => {
    const bad = FPS.replace('if (Physics.Raycast(cameraHolder.position, cameraHolder.forward, out RaycastHit hit, 100f))', 'Physics.Raycast(cameraHolder.position, Vector3.up, out RaycastHit hit, 100f);\n            if (true)');
    const w = new World3D(room());
    await w.load(bad);
    const r = w.simulate(0.5, [{ until: 0.1, buttons: [0] }, { until: 1e9 }]);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/hit nothing/);
  });

  it('an endless loop in Update is stopped with an explanation', async () => {
    const w = new World3D(room());
    await w.load(FPS.replace('void Update()\n    {', 'void Update()\n    {\n        while (true) { }'));
    const r = w.simulate(0.2, [{ until: 1e9 }]);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/endless loop|took too long/);
  });
});
