// Mini-Unity levels: each one teaches one real Unity idea. Every level has a solution that the
// tests play automatically (tests/unity.test.ts), so every level is guaranteed to be solvable.

import type { Text2 } from '../i18n';
import type { Level, ObjSpec } from './unity';

const T = (en: string, ru: string): Text2 => ({ en, ru });

/** Starter code: the same code with English or Russian comments. */
export type Starter = Text2;

export interface MiniLevel extends Omit<Level, 'starter'> {
  starter: Starter;
}

const ground = (w: number): ObjSpec[] => Array.from({ length: w }, (_, i) => ({ name: 'Ground', tag: 'Ground', sprite: 'platform' as const, x: i + 0.5, y: 0.5 }));

const MOVE = `        float h = 0;
        float v = 0;
        if (Input.GetKey(KeyCode.RightArrow)) h = 1;
        if (Input.GetKey(KeyCode.LeftArrow)) h = -1;
        if (Input.GetKey(KeyCode.UpArrow)) v = 1;
        if (Input.GetKey(KeyCode.DownArrow)) v = -1;
        transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;`;

export const LEVELS: MiniLevel[] = [
  {
    id: 'hello',
    icon: '👋',
    title: T('Hello, Unity', 'Привет, Unity'),
    learn: T('Start() runs once when the game begins. Debug.Log writes a message to the Console.', 'Start() выполняется один раз в начале игры. Debug.Log пишет сообщение в консоль.'),
    task: T('Make the script write Hello, Unity! to the Console when the game starts.', 'Сделай так, чтобы при старте игры в консоли появилось Hello, Unity!'),
    hint: T('Inside Start write: Debug.Log("Hello, Unity!");', 'Внутри Start напиши: Debug.Log("Hello, Unity!");'),
    width: 8,
    height: 4,
    player: { x: 4, y: 2 },
    objects: [],
    goal: { type: 'log', text: 'Hello, Unity!' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        // Write your first message here
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        // Напиши здесь своё первое сообщение
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        Debug.Log("Hello, Unity!");
    }
}
`,
    demo: [{ until: 1, keys: [] }],
  },
  {
    id: 'move-right',
    icon: '➡️',
    title: T('A step to the right', 'Шаг вправо'),
    learn: T('Update() runs every frame. transform.position is where the object is. Time.deltaTime makes the speed the same on every computer.', 'Update() выполняется каждый кадр. transform.position — где находится объект. Time.deltaTime делает скорость одинаковой на любом компьютере.'),
    task: T('Make the hero walk to the flag on its own.', 'Сделай так, чтобы герой сам дошёл до флага.'),
    hint: T('In Update: transform.position += Vector3.right * speed * Time.deltaTime;', 'В Update: transform.position += Vector3.right * speed * Time.deltaTime;'),
    width: 10,
    height: 4,
    player: { x: 1, y: 2 },
    objects: [{ name: 'Flag', tag: 'Finish', sprite: 'flag', x: 8.5, y: 2 }],
    goal: { type: 'reach' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
        // Move the hero to the right a little every frame
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
        // Каждый кадр сдвигай героя немного вправо
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
        transform.position += Vector3.right * speed * Time.deltaTime;
    }
}
`,
    demo: [{ until: 5, keys: [] }],
  },
  {
    id: 'arrows',
    icon: '⌨️',
    title: T('Arrow keys', 'Управление стрелками'),
    learn: T('Input.GetKey(KeyCode.RightArrow) is true while the key is held. if decides what to do.', 'Input.GetKey(KeyCode.RightArrow) — правда, пока клавиша зажата. if решает, что делать.'),
    task: T('Steer the hero with the arrow keys over the wall to the flag. (Click the game first, then use the arrows.)', 'Управляй героем стрелками: обойди стену сверху и дойди до флага. (Сначала нажми на игру, потом стрелки.)'),
    hint: T('Check each arrow with if (Input.GetKey(KeyCode.UpArrow)) and move up, down, left or right.', 'Проверяй каждую стрелку через if (Input.GetKey(KeyCode.UpArrow)) и двигай вверх, вниз, влево или вправо.'),
    width: 10,
    height: 6,
    player: { x: 1, y: 1 },
    objects: [
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 0.5 },
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 },
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 2.5 },
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 3.5 },
      { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 8.5, y: 1 },
    ],
    goal: { type: 'reach' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
        if (Input.GetKey(KeyCode.RightArrow))
        {
            transform.position += Vector3.right * speed * Time.deltaTime;
        }
        // Add the other arrows: LeftArrow, UpArrow, DownArrow
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
        if (Input.GetKey(KeyCode.RightArrow))
        {
            transform.position += Vector3.right * speed * Time.deltaTime;
        }
        // Добавь остальные стрелки: LeftArrow, UpArrow, DownArrow
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;

    void Update()
    {
${MOVE}
    }
}
`,
    demo: [
      { until: 1.3, keys: ['ArrowUp'] },
      { until: 3.8, keys: ['ArrowRight'] },
      { until: 5.6, keys: ['ArrowDown'] },
      { until: 7, keys: [] },
    ],
  },
  {
    id: 'coins',
    icon: '🪙',
    title: T('Collect the coins', 'Собери монеты'),
    learn: T('OnTriggerEnter2D(other) runs when the hero touches something. CompareTag checks what it is. Destroy removes it.', 'OnTriggerEnter2D(other) срабатывает, когда герой чего-то касается. CompareTag проверяет, что это. Destroy убирает объект.'),
    task: T('Make coins disappear when the hero touches them, and count them in score.', 'Сделай так, чтобы монеты исчезали при касании, и считай их в score.'),
    hint: T('void OnTriggerEnter2D(Collider2D other) { if (other.CompareTag("Coin")) { score++; Destroy(other.gameObject); } }', 'void OnTriggerEnter2D(Collider2D other) { if (other.CompareTag("Coin")) { score++; Destroy(other.gameObject); } }'),
    width: 10,
    height: 4,
    player: { x: 1, y: 2 },
    objects: [3, 5, 7, 9].map((x) => ({ name: 'Coin', tag: 'Coin', sprite: 'coin' as const, x, y: 2 })),
    goal: { type: 'collect' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    void Update()
    {
${MOVE}
    }

    // Unity calls this when the hero touches another object
    void OnTriggerEnter2D(Collider2D other)
    {
        // If it is a coin: add 1 to score and remove the coin
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    void Update()
    {
${MOVE}
    }

    // Unity вызывает это, когда герой касается другого объекта
    void OnTriggerEnter2D(Collider2D other)
    {
        // Если это монета: прибавь 1 к score и убери монету
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    void Update()
    {
${MOVE}
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            score++;
            Destroy(other.gameObject);
        }
    }
}
`,
    demo: [{ until: 3, keys: ['ArrowRight'] }],
  },
  {
    id: 'axis',
    icon: '🕹️',
    title: T('Smooth controls: GetAxis', 'Плавное управление: GetAxis'),
    learn: T('Input.GetAxis("Horizontal") gives −1…1 for left/right (arrows or A/D). One line instead of four ifs.', 'Input.GetAxis("Horizontal") даёт от −1 до 1 для влево/вправо (стрелки или A/D). Одна строка вместо четырёх if.'),
    task: T('Move with GetAxis and reach the flag. Avoid the red enemies — touching one means starting over!', 'Двигайся через GetAxis и дойди до флага. Не касайся красных врагов — иначе начнёшь заново!'),
    hint: T('float h = Input.GetAxis("Horizontal"); float v = Input.GetAxis("Vertical"); transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;', 'float h = Input.GetAxis("Horizontal"); float v = Input.GetAxis("Vertical"); transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;'),
    width: 10,
    height: 6,
    player: { x: 1, y: 1 },
    objects: [
      { name: 'Enemy', tag: 'Enemy', sprite: 'enemy', x: 4, y: 0.6, patrol: { dx: 0, dy: 2.6, speed: 1.6 }, danger: true },
      { name: 'Enemy', tag: 'Enemy', sprite: 'enemy', x: 6.5, y: 0.6, patrol: { dx: 0, dy: 2.6, speed: 2 }, danger: true },
      { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 8.8, y: 1 },
    ],
    goal: { type: 'reach' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;

    void Update()
    {
        // 1. Read the horizontal and vertical axis
        // 2. Move the hero by new Vector3(h, v, 0) * speed * Time.deltaTime
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;

    void Update()
    {
        // 1. Прочитай горизонтальную и вертикальную оси
        // 2. Сдвинь героя на new Vector3(h, v, 0) * speed * Time.deltaTime
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        transform.position += new Vector3(h, v, 0) * speed * Time.deltaTime;
    }
}
`,
    demo: [
      { until: 1.05, keys: ['ArrowUp'] },
      { until: 3.1, keys: ['ArrowRight'] },
      { until: 4.15, keys: ['ArrowDown'] },
      { until: 6, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'jump',
    icon: '🦘',
    title: T('Jump with Rigidbody2D', 'Прыжок с Rigidbody2D'),
    learn: T('Rigidbody2D adds gravity. GetComponent<Rigidbody2D>() finds it; velocity is the speed; AddForce with Impulse makes a jump.', 'Rigidbody2D добавляет гравитацию. GetComponent<Rigidbody2D>() находит его; velocity — скорость; AddForce с Impulse делает прыжок.'),
    task: T('Walk right with the arrows and jump over the wall with Space.', 'Иди вправо стрелками и перепрыгни стену пробелом.'),
    hint: T('In Start: rb = GetComponent<Rigidbody2D>(); In Update: rb.velocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.velocity.y); and on Space: rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);', 'В Start: rb = GetComponent<Rigidbody2D>(); В Update: rb.velocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.velocity.y); а на пробел: rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);'),
    width: 10,
    height: 6,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [...ground(10), { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 }, { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 8.5, y: 1.5 }],
    goal: { type: 'reach' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 7f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.velocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.velocity.y);
        // When Space is pressed, push the hero up
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 7f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.velocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.velocity.y);
        // Когда нажат пробел, толкни героя вверх
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 7f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.velocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.velocity.y);
        if (Input.GetKeyDown(KeyCode.Space))
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}
`,
    demo: [
      { until: 0.6, keys: ['ArrowRight'] },
      { until: 0.65, keys: ['ArrowRight', ' '] },
      { until: 4, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'shooter',
    icon: '🚀',
    title: T('Shooter: Instantiate', 'Стрелялка: Instantiate'),
    learn: T('A prefab is a ready-made object. Instantiate(prefab, position, rotation) creates a copy — here, a bullet.', 'Префаб — готовый объект-заготовка. Instantiate(prefab, position, rotation) создаёт копию — здесь пулю.'),
    task: T('Move left/right and shoot with Space. Destroy all enemies.', 'Двигайся влево-вправо и стреляй пробелом. Уничтожь всех врагов.'),
    hint: T('if (Input.GetKeyDown(KeyCode.Space)) Instantiate(bulletPrefab, transform.position, Quaternion.identity);', 'if (Input.GetKeyDown(KeyCode.Space)) Instantiate(bulletPrefab, transform.position, Quaternion.identity);'),
    width: 9,
    height: 7,
    player: { x: 1, y: 1 },
    objects: [3, 5, 7].map((x) => ({ name: 'Enemy', tag: 'Enemy', sprite: 'enemy' as const, x, y: 6 })),
    goal: { type: 'destroyAll', tag: 'Enemy' },
    inspector: { bulletPrefab: 'bulletPrefab' },
    starter: T(
      `using UnityEngine;

public class Ship : MonoBehaviour
{
    public float speed = 4f;
    public GameObject bulletPrefab; // already set in the Inspector

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        transform.position += new Vector3(h, 0, 0) * speed * Time.deltaTime;
        // Shoot when Space is pressed
    }
}
`,
      `using UnityEngine;

public class Ship : MonoBehaviour
{
    public float speed = 4f;
    public GameObject bulletPrefab; // уже задан в Инспекторе

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        transform.position += new Vector3(h, 0, 0) * speed * Time.deltaTime;
        // Стреляй, когда нажат пробел
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Ship : MonoBehaviour
{
    public float speed = 4f;
    public GameObject bulletPrefab;

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        transform.position += new Vector3(h, 0, 0) * speed * Time.deltaTime;
        if (Input.GetKeyDown(KeyCode.Space))
        {
            Instantiate(bulletPrefab, transform.position, Quaternion.identity);
        }
    }
}
`,
    demo: [
      { until: 0.5, keys: ['ArrowRight'] },
      { until: 0.55, keys: [' '] },
      { until: 1.05, keys: ['ArrowRight'] },
      { until: 1.1, keys: [' '] },
      { until: 1.6, keys: ['ArrowRight'] },
      { until: 1.65, keys: [' '] },
      { until: 4, keys: [] },
    ],
  },
  {
    id: 'timer',
    icon: '⏱️',
    title: T('A timer', 'Таймер'),
    learn: T('Adding Time.deltaTime every frame counts real seconds. A bool remembers that something already happened.', 'Если каждый кадр прибавлять Time.deltaTime, получится счёт настоящих секунд. bool запоминает, что что-то уже случилось.'),
    task: T('After 3 seconds write Time! to the Console — exactly once.', 'Через 3 секунды напиши в консоль Time! — ровно один раз.'),
    hint: T('timer += Time.deltaTime; if (timer >= 3 && !done) { Debug.Log("Time!"); done = true; }', 'timer += Time.deltaTime; if (timer >= 3 && !done) { Debug.Log("Time!"); done = true; }'),
    width: 8,
    height: 4,
    player: { x: 4, y: 2 },
    objects: [],
    goal: { type: 'log', text: 'Time!', afterSeconds: 3 },
    starter: T(
      `using UnityEngine;

public class Clock : MonoBehaviour
{
    float timer = 0f;
    bool done = false;

    void Update()
    {
        // Count the seconds and write "Time!" once after 3 seconds
    }
}
`,
      `using UnityEngine;

public class Clock : MonoBehaviour
{
    float timer = 0f;
    bool done = false;

    void Update()
    {
        // Считай секунды и один раз через 3 секунды напиши "Time!"
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Clock : MonoBehaviour
{
    float timer = 0f;
    bool done = false;

    void Update()
    {
        timer += Time.deltaTime;
        if (timer >= 3f && !done)
        {
            Debug.Log("Time!");
            done = true;
        }
    }
}
`,
    demo: [{ until: 5, keys: [] }],
  },
  {
    id: 'final',
    icon: '🏆',
    title: T('Final: coins and a score', 'Финал: монеты и счёт'),
    learn: T('Combine everything: movement, triggers, tags, a public score that you can watch in the Inspector.', 'Соедини всё: движение, триггеры, теги и публичный score, который видно в Инспекторе.'),
    task: T('Write the whole script yourself: move, collect all 6 coins (score must become 6) and avoid the enemy.', 'Напиши весь скрипт сам: двигайся, собери все 6 монет (score должен стать 6) и не попадись врагу.'),
    hint: T('Take the movement from "Arrow keys" and the coin code from "Collect the coins".', 'Возьми движение из «Управление стрелками», а монеты — из «Собери монеты».'),
    width: 10,
    height: 6,
    player: { x: 1, y: 1 },
    objects: [
      ...[2.5, 4.5, 6.5].map((x) => ({ name: 'Coin', tag: 'Coin', sprite: 'coin' as const, x, y: 1 })),
      ...[2.5, 4.5, 6.5].map((x) => ({ name: 'Coin', tag: 'Coin', sprite: 'coin' as const, x, y: 5 })),
      { name: 'Enemy', tag: 'Enemy', sprite: 'enemy', x: 9, y: 1, patrol: { dx: 0, dy: 3.6, speed: 1.2 }, danger: true },
    ],
    goal: { type: 'field', field: 'score', value: 6 },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    // Your code here
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    // Твой код здесь
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 4f;
    public int score = 0;

    void Update()
    {
${MOVE}
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            score++;
            Destroy(other.gameObject);
        }
    }
}
`,
    demo: [
      { until: 1.5, keys: ['ArrowRight'] },
      { until: 2.5, keys: ['ArrowUp'] },
      { until: 3.5, keys: ['ArrowLeft'] },
      { until: 4.5, keys: ['ArrowRight', 'ArrowUp'] },
      { until: 6, keys: ['ArrowLeft'] },
      { until: 7, keys: [] },
    ],
  },
  {
    id: 'coroutine',
    icon: '⏳',
    title: T('Coroutine: wait without freezing', 'Корутина: подождать, не замораживая игру'),
    learn: T('A method that returns IEnumerator can pause: yield return new WaitForSeconds(2f) waits 2 seconds while the game keeps running. Start it with StartCoroutine(…).', 'Метод, который возвращает IEnumerator, умеет делать паузу: yield return new WaitForSeconds(2f) ждёт 2 секунды, а игра при этом идёт дальше. Запускают через StartCoroutine(…).'),
    task: T('Start the coroutine and make it wait 2 seconds before writing Ready!', 'Запусти корутину и сделай так, чтобы она ждала 2 секунды перед тем, как написать Ready!'),
    hint: T('In Start: StartCoroutine(Countdown()); In Countdown replace yield return null; with yield return new WaitForSeconds(2f);', 'В Start: StartCoroutine(Countdown()); В Countdown замени yield return null; на yield return new WaitForSeconds(2f);'),
    width: 8,
    height: 4,
    player: { x: 4, y: 2 },
    objects: [],
    goal: { type: 'log', text: 'Ready!', afterSeconds: 2 },
    starter: T(
      `using System.Collections;
using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        // Start the coroutine here
    }

    IEnumerator Countdown()
    {
        Debug.Log("Wait...");
        yield return null; // ← wait 2 seconds instead
        Debug.Log("Ready!");
    }
}
`,
      `using System.Collections;
using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        // Запусти корутину здесь
    }

    IEnumerator Countdown()
    {
        Debug.Log("Wait...");
        yield return null; // ← здесь нужно ждать 2 секунды
        Debug.Log("Ready!");
    }
}
`,
    ),
    solution: `using System.Collections;
using UnityEngine;

public class Hero : MonoBehaviour
{
    void Start()
    {
        StartCoroutine(Countdown());
    }

    IEnumerator Countdown()
    {
        Debug.Log("Wait...");
        yield return new WaitForSeconds(2f);
        Debug.Log("Ready!");
    }
}
`,
    demo: [{ until: 4, keys: [] }],
  },
  {
    id: 'invoke',
    icon: '🔔',
    title: T('Repeat on a schedule: InvokeRepeating', 'Повтор по расписанию: InvokeRepeating'),
    learn: T('InvokeRepeating("Tick", 0.5f, 0.5f) calls the method Tick after 0.5 s and then every 0.5 s — a timer without writing a timer.', 'InvokeRepeating("Tick", 0.5f, 0.5f) вызывает метод Tick через 0.5 с, а потом каждые 0.5 с — таймер без своего таймера.'),
    task: T('Make Tick run every half second until count reaches 5.', 'Сделай так, чтобы Tick вызывался каждые полсекунды, пока count не станет 5.'),
    hint: T('In Start: InvokeRepeating("Tick", 0.5f, 0.5f);', 'В Start: InvokeRepeating("Tick", 0.5f, 0.5f);'),
    width: 8,
    height: 4,
    player: { x: 4, y: 2 },
    objects: [],
    goal: { type: 'field', field: 'count', value: 5 },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public int count = 0;

    void Start()
    {
        // Call Tick every 0.5 seconds
    }

    void Tick()
    {
        count++;
        Debug.Log("Tick " + count);
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public int count = 0;

    void Start()
    {
        // Вызывай Tick каждые 0.5 секунды
    }

    void Tick()
    {
        count++;
        Debug.Log("Tick " + count);
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public int count = 0;

    void Start()
    {
        InvokeRepeating("Tick", 0.5f, 0.5f);
    }

    void Tick()
    {
        count++;
        Debug.Log("Tick " + count);
    }
}
`,
    demo: [{ until: 5, keys: [] }],
  },
  {
    id: 'ground-ray',
    icon: '🔦',
    title: T('Jump only from the ground (Raycast)', 'Прыжок только с земли (луч)'),
    learn: T('Physics2D.Raycast shoots an invisible ray. A short ray down from the hero tells whether he stands on something — so no jumping in the air.', 'Physics2D.Raycast пускает невидимый луч. Короткий луч вниз от героя говорит, стоит ли он на чём-то, — значит, в воздухе прыгать нельзя.'),
    task: T('Reach the flag. Spikes hang above: jumping in the air (pressing Space many times) flies into them. Allow a jump only on the ground.', 'Дойди до флага. Сверху висят шипы: прыжки в воздухе (много нажатий пробела) унесут героя прямо в них. Разреши прыгать только с земли.'),
    hint: T('RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f); then jump only if hit.collider != null.', 'RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f); и прыгай, только если hit.collider != null.'),
    width: 10,
    height: 6,
    player: { x: 1, y: 1.5, rigidbody: true },
    objects: [
      ...ground(10),
      { name: 'Wall', tag: 'Wall', sprite: 'wall', x: 5, y: 1.5 },
      ...[3, 4, 5, 6, 7].map((x) => ({ name: 'Spikes', tag: 'Enemy', sprite: 'enemy' as const, x, y: 4.6, danger: true })),
      { name: 'Flag', tag: 'Finish', sprite: 'flag', x: 8.5, y: 1.5 },
    ],
    goal: { type: 'reach' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 6f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.linearVelocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.linearVelocity.y);
        // Check the ground with a ray before jumping
        if (Input.GetKeyDown(KeyCode.Space))
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 6f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.linearVelocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.linearVelocity.y);
        // Перед прыжком проверь лучом, есть ли земля под ногами
        if (Input.GetKeyDown(KeyCode.Space))
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    public float speed = 3f;
    public float jumpForce = 6f;
    Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        rb.linearVelocity = new Vector2(Input.GetAxis("Horizontal") * speed, rb.linearVelocity.y);
        RaycastHit2D hit = Physics2D.Raycast(transform.position, Vector2.down, 0.6f);
        bool grounded = hit.collider != null;
        if (Input.GetKeyDown(KeyCode.Space) && grounded)
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}
`,
    demo: [
      { until: 0.9, keys: ['ArrowRight'] },
      { until: 0.95, keys: ['ArrowRight', ' '] },
      { until: 1.1, keys: ['ArrowRight'] },
      { until: 1.15, keys: ['ArrowRight', ' '] },
      { until: 1.3, keys: ['ArrowRight'] },
      { until: 1.35, keys: ['ArrowRight', ' '] },
      { until: 1.5, keys: ['ArrowRight'] },
      { until: 1.55, keys: ['ArrowRight', ' '] },
      { until: 6, keys: ['ArrowRight'] },
    ],
  },
  {
    id: 'find-tag',
    icon: '🎯',
    title: T('Find objects by tag', 'Найти объект по тегу'),
    learn: T('GameObject.FindWithTag("Enemy") finds an object with that tag anywhere in the scene (or null when there is none). Check for null before using it!', 'GameObject.FindWithTag("Enemy") находит объект с таким тегом где угодно в сцене (или null, если его нет). Перед использованием проверяй на null!'),
    task: T('Each press of Space destroys one enemy. Destroy both.', 'Каждое нажатие пробела уничтожает одного врага. Уничтожь обоих.'),
    hint: T('GameObject enemy = GameObject.FindWithTag("Enemy"); if (enemy != null) Destroy(enemy);', 'GameObject enemy = GameObject.FindWithTag("Enemy"); if (enemy != null) Destroy(enemy);'),
    width: 8,
    height: 4,
    player: { x: 1, y: 2 },
    objects: [
      { name: 'Slime', tag: 'Enemy', sprite: 'enemy', x: 4, y: 2 },
      { name: 'Bat', tag: 'Enemy', sprite: 'enemy', x: 6.5, y: 2.5, patrol: { dx: 0, dy: 1, speed: 2 } },
    ],
    goal: { type: 'destroyAll', tag: 'Enemy' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
        {
            // Find an enemy by its tag and destroy it
        }
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
        {
            // Найди врага по тегу и уничтожь его
        }
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
        {
            GameObject enemy = GameObject.FindWithTag("Enemy");
            if (enemy != null)
            {
                Destroy(enemy);
            }
        }
    }
}
`,
    demo: [
      { until: 0.5, keys: [] },
      { until: 0.55, keys: [' '] },
      { until: 1, keys: [] },
      { until: 1.05, keys: [' '] },
      { until: 2, keys: [] },
    ],
  },
  {
    id: 'magnet',
    icon: '🧲',
    title: T('Arrays and foreach: a coin magnet', 'Массивы и foreach: магнит для монет'),
    learn: T('FindGameObjectsWithTag gives an array of all such objects. foreach goes through every one of them — here every coin flies to the hero.', 'FindGameObjectsWithTag даёт массив всех таких объектов. foreach проходит по каждому из них — здесь каждая монета летит к герою.'),
    task: T('The hero cannot move. Pull all coins to him.', 'Герой не может двигаться. Притяни к нему все монеты.'),
    hint: T('In Start: coins = GameObject.FindGameObjectsWithTag("Coin"); In Update: foreach (GameObject c in coins) if (c != null) c.transform.position = Vector2.MoveTowards(c.transform.position, transform.position, 4f * Time.deltaTime);', 'В Start: coins = GameObject.FindGameObjectsWithTag("Coin"); В Update: foreach (GameObject c in coins) if (c != null) c.transform.position = Vector2.MoveTowards(c.transform.position, transform.position, 4f * Time.deltaTime);'),
    width: 10,
    height: 6,
    player: { x: 5, y: 3 },
    objects: [
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 1, y: 1 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 9, y: 1 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 1, y: 5 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 9, y: 5 },
      { name: 'Coin', tag: 'Coin', sprite: 'coin', x: 5, y: 5.3 },
    ],
    goal: { type: 'collect' },
    starter: T(
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    GameObject[] coins;

    void Start()
    {
        // Find all coins once
    }

    void Update()
    {
        // Move every coin towards the hero
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            Destroy(other.gameObject);
        }
    }
}
`,
      `using UnityEngine;

public class Hero : MonoBehaviour
{
    GameObject[] coins;

    void Start()
    {
        // Найди все монеты один раз
    }

    void Update()
    {
        // Двигай каждую монету к герою
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            Destroy(other.gameObject);
        }
    }
}
`,
    ),
    solution: `using UnityEngine;

public class Hero : MonoBehaviour
{
    GameObject[] coins;

    void Start()
    {
        coins = GameObject.FindGameObjectsWithTag("Coin");
    }

    void Update()
    {
        foreach (GameObject c in coins)
        {
            if (c != null)
            {
                c.transform.position = Vector2.MoveTowards(c.transform.position, transform.position, 4f * Time.deltaTime);
            }
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            Destroy(other.gameObject);
        }
    }
}
`,
    demo: [{ until: 6, keys: [] }],
  },
];

export function starterOf(level: MiniLevel, locale: 'ru' | 'en'): string {
  return locale === 'ru' ? level.starter.ru : level.starter.en;
}

export function asLevel(level: MiniLevel, locale: 'ru' | 'en'): Level {
  return { ...level, starter: starterOf(level, locale) };
}

/** A free-play world for any script from the Workshop: ground, platforms, coins, an enemy, a flag.
 *  The script goes onto the object its name suggests (an enemy script onto the enemy, a platform script
 *  onto a platform…), and empty Inspector fields are filled with sensible objects (written to the Console). */
export function sandboxLevel(code: string, name: string): Level {
  const cls = /class\s+(\w+)\s*:\s*MonoBehaviour/.exec(code)?.[1] ?? '';
  const hero = /Player|Hero|Character/i.test(cls);
  const attach = hero ? undefined : /Enemy|Patrol|Chase|Guard|Monster/i.test(cls) ? 'Enemy' : /Platform|Elevator|Lift/i.test(cls) ? 'Platform' : /Spawn/i.test(cls) && !/Respawn/i.test(cls) ? 'Spawner' : /Camera/i.test(cls) ? 'MainCamera' : undefined;
  const physics = !attach && /Rigidbody2D/.test(code) && !/CharacterController/.test(code);
  const prefabFields: Record<string, 'bulletPrefab'> = {};
  if (/Shoot|Gun|Weapon|Fire/i.test(cls) || /bulletPrefab/.test(code))
    for (const m of code.matchAll(/public\s+(?:GameObject|Rigidbody2D)\s+(\w*(?:[Bb]ullet)\w*)\s*;/g)) prefabFields[m[1]] = 'bulletPrefab';
  const low = physics || /CharacterController/.test(code);
  const coins: ObjSpec[] = [4, 6, 8, 10, 12].map((x, i) => ({ name: `Coin${i + 1}`, tag: 'Coin', sprite: 'coin', x, y: low ? (i % 2 ? 3.2 : 1.6) : 3 + (i % 2) }));
  return {
    id: 'sandbox',
    icon: '🧪',
    title: T(`Sandbox: ${name}`, `Песочница: ${name}`),
    task: T('Free play: try your script. Arrow keys / WASD / Space / mouse control the game.', 'Свободная игра: попробуй свой скрипт. Стрелки / WASD / пробел / мышь управляют игрой.'),
    learn: T(
      attach ? `The script is on the object "${attach}" (like putting it on that object in Unity).` : 'Mini-Unity supports a big part of Unity: Start, Update, transform, Input (keys and mouse), Time, Rigidbody2D, triggers, coroutines, Instantiate, Destroy, Physics2D, Debug.Log.',
      attach ? `Скрипт висит на объекте «${attach}» (как будто ты повесил его на этот объект в Unity).` : 'Мини-Unity понимает большую часть Unity: Start, Update, transform, Input (клавиши и мышь), Time, Rigidbody2D, триггеры, корутины, Instantiate, Destroy, Physics2D, Debug.Log.',
    ),
    hint: T('Empty Inspector fields are filled automatically — see the Console. Things Mini-Unity does not know are reported honestly.', 'Пустые поля Inspector заполняются сами — смотри Console. То, чего Мини-Unity не знает, она честно сообщит.'),
    width: 16,
    height: 9,
    player: { x: 2, y: low ? 1.5 : 3, rigidbody: physics },
    objects: [
      ...ground(16),
      { name: 'Platform', tag: 'Platform', sprite: 'platform', x: 7, y: 2.6, w: 2, h: 0.4 },
      { name: 'Platform', tag: 'Ground', sprite: 'platform', x: 11, y: 2.6, w: 2, h: 0.4 },
      ...coins,
      { name: 'Enemy', tag: 'Enemy', sprite: 'enemy', x: 9, y: 1.5, patrol: { dx: 3, dy: 0, speed: 1.2 }, danger: true },
      { name: 'Finish', tag: 'Finish', sprite: 'flag', x: 15, y: 1.5 },
      { name: 'Spawner', tag: 'Spawner', sprite: 'none', x: 8, y: 8, w: 0.1, h: 0.1 },
      { name: 'Main Camera', tag: 'MainCamera', sprite: 'none', x: 8, y: 4.5, w: 0.1, h: 0.1 },
    ],
    goal: { type: 'free' },
    starter: code,
    solution: code,
    demo: [],
    inspector: prefabFields,
    attach,
    autoInspector: true,
  };
}
