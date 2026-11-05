// "I want…" — ready-made, explained pieces of code for what beginners most often want to make.
// Mostly Unity C# (movement, jump, coins, enemies, UI, saving…), plus console C#, C++/Unreal, C,
// Python and JavaScript. Every recipe says what it does, how to set it up in the engine, and
// explains its important lines. Search understands Russian and English and forgiving word forms.

import { pick, type Text2 } from '../i18n';
import type { EditLang } from './predict';

export interface Recipe {
  id: string;
  lang: EditLang;
  /** Unity script (MonoBehaviour), console program, etc. */
  kind: 'unity' | 'console' | 'unreal' | 'program';
  title: Text2;
  /** Extra search words (both languages). */
  words: string;
  about: Text2;
  /** What to do in the editor (Unity/Unreal) so it works. */
  setup?: Text2[];
  code: string;
  /** Explanations for lines containing the given text. */
  notes: [string, Text2][];
}

const T = (en: string, ru: string): Text2 => ({ en, ru });
const N = (match: string, en: string, ru: string): [string, Text2] => [match, { en, ru }];

export const RECIPES: Recipe[] = [
  // ============================================================== Unity: movement
  {
    id: 'move-2d',
    lang: 'cs',
    kind: 'unity',
    title: T('Move a character with arrows / WASD (2D)', 'Двигать персонажа стрелками / WASD (2D)'),
    words: 'move movement walk run arrows wasd keys player двигать движение ходить бегать стрелки клавиши игрок персонаж управление',
    about: T('Moves the object left/right/up/down with the arrow keys or WASD. Speed is set in the Inspector.', 'Двигает объект влево/вправо/вверх/вниз стрелками или WASD. Скорость настраивается в Inspector.'),
    setup: [T('Create a script PlayerMove.cs and paste the code.', 'Создай скрипт PlayerMove.cs и вставь код.'), T('Drag the script onto the player object.', 'Перетащи скрипт на объект игрока.'), T('Press Play and use the arrows.', 'Нажми Play и используй стрелки.')],
    code: `using UnityEngine;

public class PlayerMove : MonoBehaviour
{
    public float speed = 5f;

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        float y = Input.GetAxis("Vertical");
        Vector3 move = new Vector3(x, y, 0);
        transform.Translate(move * speed * Time.deltaTime);
    }
}`,
    notes: [
      N('public float speed', 'A setting visible in the Inspector: how many units per second.', 'Настройка, видимая в Inspector: сколько единиц в секунду.'),
      N('GetAxis("Horizontal")', 'Left/right keys: -1 … 1 (0 when nothing is pressed).', 'Клавиши влево/вправо: от -1 до 1 (0, когда ничего не нажато).'),
      N('new Vector3(x, y, 0)', 'Pack the direction into one vector (z = 0 in 2D).', 'Упаковываем направление в один вектор (z = 0 в 2D).'),
      N('Time.deltaTime', 'Seconds since the last frame — the same speed on fast and slow computers.', 'Секунды с прошлого кадра — одинаковая скорость на быстром и медленном компьютере.'),
    ],
  },
  {
    id: 'move-physics-2d',
    lang: 'cs',
    kind: 'unity',
    title: T('Platformer: run and jump with physics (Rigidbody2D)', 'Платформер: бег и прыжок с физикой (Rigidbody2D)'),
    words: 'jump player character platformer rigidbody physics ground mario прыжок прыгать платформер физика земля бег',
    about: T('Left/right running with physics and a jump on Space, only when standing on the ground.', 'Бег влево/вправо с физикой и прыжок на пробел — только когда стоишь на земле.'),
    setup: [
      T('Add Rigidbody2D and a Collider2D (Box or Capsule) to the player.', 'Добавь игроку Rigidbody2D и Collider2D (Box или Capsule).'),
      T('In Rigidbody2D tick Constraints → Freeze Rotation Z, so the player does not fall over.', 'В Rigidbody2D отметь Constraints → Freeze Rotation Z, чтобы игрок не падал на бок.'),
      T('Create a layer "Ground", put your platforms on it and choose it in "Ground Layer" of the script.', 'Создай слой «Ground», поставь на него платформы и выбери его в поле «Ground Layer» скрипта.'),
      T('Create an empty child object at the player\'s feet and drag it into "Ground Check".', 'Создай пустой дочерний объект у ног игрока и перетащи его в поле «Ground Check».'),
    ],
    code: `using UnityEngine;

public class PlayerPlatformer : MonoBehaviour
{
    public float speed = 6f;
    public float jumpForce = 12f;
    public Transform groundCheck;
    public LayerMask groundLayer;

    private Rigidbody2D rb;
    private bool onGround;

    void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        float x = Input.GetAxisRaw("Horizontal");
        rb.linearVelocity = new Vector2(x * speed, rb.linearVelocity.y);

        onGround = Physics2D.OverlapCircle(groundCheck.position, 0.2f, groundLayer);

        if (Input.GetKeyDown(KeyCode.Space) && onGround)
        {
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}`,
    notes: [
      N('private Rigidbody2D rb;', 'Here we keep the physics body, found once in Awake.', 'Здесь храним физическое тело, найденное один раз в Awake.'),
      N('rb = GetComponent', 'Find the Rigidbody2D on this object once — not every frame.', 'Находим Rigidbody2D на этом объекте один раз — не каждый кадр.'),
      N('rb.linearVelocity = new Vector2', 'Set horizontal speed; keep vertical speed (gravity, jump). In Unity 2022 and older write rb.velocity.', 'Задаём скорость по горизонтали, вертикальную оставляем (гравитация, прыжок). В Unity 2022 и старше пиши rb.velocity.'),
      N('OverlapCircle', 'Is there ground in a small circle under the feet?', 'Есть ли земля в маленьком круге под ногами?'),
      N('GetKeyDown(KeyCode.Space) && onGround', 'Jump only at the moment of pressing AND when on the ground — no flying.', 'Прыгаем только в момент нажатия И когда на земле — без полётов.'),
      N('ForceMode2D.Impulse', 'A sharp push at once.', 'Резкий толчок сразу.'),
    ],
  },
  {
    id: 'move-3d-cc',
    lang: 'cs',
    kind: 'unity',
    title: T('3D walking with CharacterController (with gravity)', '3D-ходьба с CharacterController (с гравитацией)'),
    words: '3d walk charactercontroller fps third person gravity ходьба 3д персонаж гравитация от третьего лица',
    about: T('Walking in 3D relative to where the character looks, with gravity and a jump.', 'Ходьба в 3D относительно взгляда персонажа, с гравитацией и прыжком.'),
    setup: [T('Add a CharacterController component to the player (no Rigidbody needed).', 'Добавь игроку компонент CharacterController (Rigidbody не нужен).')],
    code: `using UnityEngine;

public class Walk3D : MonoBehaviour
{
    public float speed = 5f;
    public float jumpHeight = 1.5f;
    public float gravity = -20f;

    private CharacterController controller;
    private float verticalSpeed;

    void Start()
    {
        controller = GetComponent<CharacterController>();
    }

    void Update()
    {
        Vector3 input = new Vector3(Input.GetAxis("Horizontal"), 0, Input.GetAxis("Vertical"));
        Vector3 move = transform.TransformDirection(input) * speed;

        if (controller.isGrounded)
        {
            verticalSpeed = -1f;
            if (Input.GetButtonDown("Jump"))
                verticalSpeed = Mathf.Sqrt(jumpHeight * -2f * gravity);
        }
        verticalSpeed += gravity * Time.deltaTime;
        move.y = verticalSpeed;

        controller.Move(move * Time.deltaTime);
    }
}`,
    notes: [
      N('TransformDirection', 'Turns "forward on the keyboard" into "forward where the character looks".', 'Превращает «вперёд на клавиатуре» во «вперёд туда, куда смотрит персонаж».'),
      N('isGrounded', 'CharacterController knows itself whether it stands on something.', 'CharacterController сам знает, стоит ли он на чём-то.'),
      N('Mathf.Sqrt(jumpHeight', 'Physics formula: the start speed needed to reach jumpHeight.', 'Формула физики: начальная скорость, чтобы подняться на jumpHeight.'),
      N('verticalSpeed += gravity', 'Gravity pulls down a bit more every frame.', 'Гравитация каждый кадр тянет вниз чуть сильнее.'),
      N('controller.Move', 'Moves with collisions (walls stop you).', 'Двигает с учётом столкновений (стены останавливают).'),
    ],
  },
  {
    id: 'rotate',
    lang: 'cs',
    kind: 'unity',
    title: T('Rotate an object all the time (coin, fan)', 'Постоянно вращать объект (монета, вентилятор)'),
    words: 'rotate spin turn coin вращать крутить поворот вращение',
    about: T('Turns the object around by a number of degrees per second.', 'Поворачивает объект на заданное число градусов в секунду.'),
    code: `using UnityEngine;

public class Spin : MonoBehaviour
{
    public float degreesPerSecond = 90f;

    void Update()
    {
        transform.Rotate(0, 0, degreesPerSecond * Time.deltaTime);
    }
}`,
    notes: [N('transform.Rotate(0, 0,', 'Turn around the Z axis (the one that looks at you in 2D). For 3D coins use (0, speed, 0).', 'Поворот вокруг оси Z (в 2D она смотрит на тебя). Для 3D-монеты используй (0, скорость, 0).')],
  },
  {
    id: 'look-mouse-2d',
    lang: 'cs',
    kind: 'unity',
    title: T('Turn towards the mouse (2D)', 'Поворачиваться к мыши (2D)'),
    words: 'mouse aim look rotate cursor мышь прицел смотреть курсор поворот',
    about: T('The object (a gun, a ship) always faces the mouse cursor.', 'Объект (пушка, корабль) всегда смотрит на курсор мыши.'),
    code: `using UnityEngine;

public class AimAtMouse : MonoBehaviour
{
    void Update()
    {
        Vector3 mouse = Camera.main.ScreenToWorldPoint(Input.mousePosition);
        Vector2 direction = mouse - transform.position;
        float angle = Mathf.Atan2(direction.y, direction.x) * Mathf.Rad2Deg;
        transform.rotation = Quaternion.Euler(0, 0, angle);
    }
}`,
    notes: [
      N('ScreenToWorldPoint', 'Mouse pixels → a point in the game world.', 'Пиксели мыши → точка в игровом мире.'),
      N('Atan2', 'The angle of the direction (in radians), turned into degrees.', 'Угол направления (в радианах), переведённый в градусы.'),
    ],
  },
  {
    id: 'camera-follow',
    lang: 'cs',
    kind: 'unity',
    title: T('Camera follows the player smoothly', 'Камера плавно следует за игроком'),
    words: 'camera follow smooth cinemachine камера следить следовать плавно',
    about: T('Put on the camera: it follows the target softly.', 'Повесь на камеру: она мягко следует за целью.'),
    setup: [T('Put the script on Main Camera and drag the player into "Target".', 'Повесь скрипт на Main Camera и перетащи игрока в поле «Target».')],
    code: `using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    public Transform target;
    public float smooth = 5f;
    public Vector3 offset = new Vector3(0, 1, -10);

    void LateUpdate()
    {
        if (target == null) return;
        Vector3 wanted = target.position + offset;
        transform.position = Vector3.Lerp(transform.position, wanted, smooth * Time.deltaTime);
    }
}`,
    notes: [
      N('void LateUpdate', 'Runs after the player has moved this frame — no shaking.', 'Выполняется после того, как игрок уже сдвинулся в этом кадре — без дрожания.'),
      N('offset', 'The camera stays a bit higher and 10 units back (z = -10 in 2D).', 'Камера чуть выше и на 10 единиц позади (z = -10 в 2D).'),
      N('Vector3.Lerp', 'Each frame move part of the way — that is what makes it smooth.', 'Каждый кадр проходим часть пути — поэтому плавно.'),
    ],
  },
  {
    id: 'moving-platform',
    lang: 'cs',
    kind: 'unity',
    title: T('Moving platform (back and forth)', 'Движущаяся платформа (туда-обратно)'),
    words: 'platform moving patrol back forth платформа движущаяся туда обратно лифт',
    about: T('Moves between two points again and again.', 'Ездит между двумя точками снова и снова.'),
    code: `using UnityEngine;

public class MovingPlatform : MonoBehaviour
{
    public Vector3 offset = new Vector3(3, 0, 0);
    public float speed = 2f;

    private Vector3 start;

    void Start()
    {
        start = transform.position;
    }

    void Update()
    {
        float t = Mathf.PingPong(Time.time * speed, 1f);
        transform.position = Vector3.Lerp(start, start + offset, t);
    }
}`,
    notes: [N('Mathf.PingPong', 'A number that goes 0 → 1 → 0 → 1… forever.', 'Число, которое ходит 0 → 1 → 0 → 1… бесконечно.')],
  },
  // ============================================================== Unity: game rules
  {
    id: 'coins',
    lang: 'cs',
    kind: 'unity',
    title: T('Collect coins and count score', 'Собирать монеты и считать очки'),
    words: 'coin collect pickup score points монета монетки собирать подбирать очки счёт',
    about: T('When the player touches an object with the tag "Coin", the coin disappears and the score grows.', 'Когда игрок касается объекта с тегом «Coin», монета исчезает, а счёт растёт.'),
    setup: [
      T('Coins: Collider2D with "Is Trigger" ticked and the tag Coin (Tag → Add Tag).', 'Монеты: Collider2D с галочкой «Is Trigger» и тег Coin (Tag → Add Tag).'),
      T('Player: Rigidbody2D and Collider2D; put this script on the player.', 'Игрок: Rigidbody2D и Collider2D; этот скрипт вешается на игрока.'),
    ],
    code: `using UnityEngine;

public class CoinCollector : MonoBehaviour
{
    public int score = 0;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            score++;
            Destroy(other.gameObject);
            Debug.Log("Score: " + score);
        }
    }
}`,
    notes: [
      N('OnTriggerEnter2D', 'Unity calls this by itself when we enter a trigger.', 'Unity сама вызывает это, когда мы входим в триггер.'),
      N('CompareTag("Coin")', 'Only coins count — not walls, not enemies.', 'Считаются только монеты — не стены и не враги.'),
      N('Destroy(other.gameObject)', 'Remove the coin (other is its collider, .gameObject is the coin itself).', 'Убираем монету (other — её коллайдер, .gameObject — сама монета).'),
    ],
  },
  {
    id: 'score-ui',
    lang: 'cs',
    kind: 'unity',
    title: T('Show the score on screen (TextMeshPro)', 'Показывать счёт на экране (TextMeshPro)'),
    words: 'ui text score display textmeshpro tmp hud интерфейс текст счёт показать экран',
    about: T('A score manager that updates a TextMeshPro text. Other scripts call ScoreManager.Instance.Add(1).', 'Менеджер счёта, который обновляет текст TextMeshPro. Другие скрипты вызывают ScoreManager.Instance.Add(1).'),
    setup: [T('GameObject → UI → Text - TextMeshPro. Put this script on any object and drag the text into "Score Text".', 'GameObject → UI → Text - TextMeshPro. Повесь скрипт на любой объект и перетащи текст в поле «Score Text».')],
    code: `using UnityEngine;
using TMPro;

public class ScoreManager : MonoBehaviour
{
    public static ScoreManager Instance;
    public TMP_Text scoreText;
    private int score;

    void Awake()
    {
        Instance = this;
    }

    public void Add(int points)
    {
        score += points;
        scoreText.text = "Score: " + score;
    }
}`,
    notes: [
      N('using TMPro;', 'Connects TextMeshPro — the modern text in Unity.', 'Подключает TextMeshPro — современный текст в Unity.'),
      N('public static ScoreManager Instance', 'One shared manager everyone can reach (a "singleton").', 'Один общий менеджер, до которого все могут дотянуться («синглтон»).'),
      N('scoreText.text =', 'Changing .text changes what the player sees.', 'Изменение .text меняет то, что видит игрок.'),
    ],
  },
  {
    id: 'health',
    lang: 'cs',
    kind: 'unity',
    title: T('Health, damage and death', 'Здоровье, урон и смерть'),
    words: 'health hp damage die death life lives здоровье хп урон смерть умереть жизни',
    about: T('A health component: TakeDamage lowers health, at 0 the object dies.', 'Компонент здоровья: TakeDamage уменьшает здоровье, на 0 объект умирает.'),
    code: `using UnityEngine;

public class Health : MonoBehaviour
{
    public int maxHealth = 3;
    private int health;

    void Start()
    {
        health = maxHealth;
    }

    public void TakeDamage(int amount)
    {
        health -= amount;
        health = Mathf.Clamp(health, 0, maxHealth);
        Debug.Log(name + " health: " + health);
        if (health <= 0)
        {
            Die();
        }
    }

    void Die()
    {
        Destroy(gameObject);
    }
}`,
    notes: [
      N('public void TakeDamage', 'public → enemies, bullets and spikes can call it.', 'public → враги, пули и шипы могут это вызвать.'),
      N('Mathf.Clamp', 'Health never goes below 0 or above the maximum.', 'Здоровье не уходит ниже 0 и выше максимума.'),
      N('if (health <= 0)', 'Check after every hit whether it was the last one.', 'После каждого удара проверяем, не последний ли он.'),
    ],
  },
  {
    id: 'damage-on-touch',
    lang: 'cs',
    kind: 'unity',
    title: T('Spikes / enemy hurt the player on touch', 'Шипы / враг ранят игрока при касании'),
    words: 'damage spikes hurt enemy touch trap шипы урон ранить ловушка касание враг',
    about: T('Put on spikes or an enemy: whoever has a Health component loses health on touch.', 'Повесь на шипы или врага: у того, у кого есть компонент Health, отнимается здоровье при касании.'),
    code: `using UnityEngine;

public class DamageOnTouch : MonoBehaviour
{
    public int damage = 1;

    void OnCollisionEnter2D(Collision2D collision)
    {
        Health health = collision.gameObject.GetComponent<Health>();
        if (health != null)
        {
            health.TakeDamage(damage);
        }
    }
}`,
    notes: [N('GetComponent<Health>()', 'Does the touched object have health? If not, we get null.', 'Есть ли у того, кого коснулись, здоровье? Если нет — получим null.'), N('if (health != null)', 'Always check — otherwise NullReferenceException.', 'Обязательно проверяем — иначе NullReferenceException.')],
  },
  {
    id: 'shoot',
    lang: 'cs',
    kind: 'unity',
    title: T('Shoot bullets (prefab)', 'Стрелять пулями (префаб)'),
    words: 'shoot bullet fire gun projectile prefab instantiate стрелять пуля выстрел оружие снаряд префаб',
    about: T('Creates a bullet from a prefab on Space or left click and launches it forward.', 'Создаёт пулю из префаба на пробел или левый клик и запускает вперёд.'),
    setup: [
      T('Make a bullet object with Rigidbody2D (Gravity Scale 0) and a Collider2D, then drag it into the Project window — it becomes a prefab.', 'Сделай объект-пулю с Rigidbody2D (Gravity Scale 0) и Collider2D и перетащи в окно Project — это префаб.'),
      T('Drag the prefab into "Bullet Prefab", and an empty child object at the gun tip into "Fire Point".', 'Перетащи префаб в поле «Bullet Prefab», а пустой дочерний объект на конце ствола — в «Fire Point».'),
    ],
    code: `using UnityEngine;

public class Shooter : MonoBehaviour
{
    public Rigidbody2D bulletPrefab;
    public Transform firePoint;
    public float bulletSpeed = 15f;
    public float cooldown = 0.25f;

    private float nextShot;

    void Update()
    {
        bool fire = Input.GetKeyDown(KeyCode.Space) || Input.GetMouseButtonDown(0);
        if (fire && Time.time >= nextShot)
        {
            Rigidbody2D bullet = Instantiate(bulletPrefab, firePoint.position, firePoint.rotation);
            bullet.linearVelocity = firePoint.right * bulletSpeed;
            Destroy(bullet.gameObject, 3f);
            nextShot = Time.time + cooldown;
        }
    }
}`,
    notes: [
      N('Time.time >= nextShot', 'A pause between shots (so holding the button is not a laser).', 'Пауза между выстрелами (чтобы нельзя было стрелять лазером).'),
      N('Instantiate(', 'Create a copy of the prefab at the gun tip.', 'Создаём копию префаба на конце ствола.'),
      N('firePoint.right', 'The direction the gun points (its red X arrow).', 'Направление ствола (его красная стрелка X).'),
      N('Destroy(bullet.gameObject, 3f)', 'Remove the bullet after 3 seconds, so thousands do not pile up.', 'Убираем пулю через 3 секунды, чтобы не копились тысячи.'),
    ],
  },
  {
    id: 'enemy-follow',
    lang: 'cs',
    kind: 'unity',
    title: T('Enemy follows the player', 'Враг преследует игрока'),
    words: 'enemy follow chase ai player враг преследовать преследует гнаться гонится погоня идти к игроку ии',
    about: T('The enemy walks towards the player when the player is close enough.', 'Враг идёт к игроку, когда тот достаточно близко.'),
    code: `using UnityEngine;

public class EnemyChase : MonoBehaviour
{
    public float speed = 2.5f;
    public float seeDistance = 6f;

    private Transform player;

    void Start()
    {
        GameObject p = GameObject.FindWithTag("Player");
        if (p != null) player = p.transform;
    }

    void Update()
    {
        if (player == null) return;
        float distance = Vector2.Distance(transform.position, player.position);
        if (distance < seeDistance)
        {
            transform.position = Vector2.MoveTowards(transform.position, player.position, speed * Time.deltaTime);
        }
    }
}`,
    notes: [
      N('FindWithTag("Player")', 'Find the player once at the start (the player must have the tag Player).', 'Находим игрока один раз в начале (у игрока должен быть тег Player).'),
      N('Vector2.Distance', 'How far is the player?', 'Насколько далеко игрок?'),
      N('MoveTowards', 'A step towards the player, never past him.', 'Шаг к игроку, но не дальше него.'),
    ],
  },
  {
    id: 'enemy-patrol',
    lang: 'cs',
    kind: 'unity',
    title: T('Enemy patrols between two points', 'Враг патрулирует между двумя точками'),
    words: 'patrol enemy waypoints back forth патруль патрулировать враг точки туда сюда',
    about: T('Walks to point A, then to point B, and turns its face in the walking direction.', 'Идёт к точке A, потом к B и поворачивается лицом в сторону движения.'),
    setup: [T('Create two empty objects as points and drag them into "Point A" and "Point B".', 'Создай два пустых объекта-точки и перетащи их в «Point A» и «Point B».')],
    code: `using UnityEngine;

public class Patrol : MonoBehaviour
{
    public Transform pointA;
    public Transform pointB;
    public float speed = 2f;

    private Transform target;

    void Start()
    {
        target = pointB;
    }

    void Update()
    {
        transform.position = Vector2.MoveTowards(transform.position, target.position, speed * Time.deltaTime);
        if (Vector2.Distance(transform.position, target.position) < 0.05f)
        {
            target = target == pointA ? pointB : pointA;
            Vector3 s = transform.localScale;
            s.x = -s.x;
            transform.localScale = s;
        }
    }
}`,
    notes: [
      N('target == pointA ? pointB : pointA', 'Arrived → the other point becomes the goal.', 'Дошли → целью становится другая точка.'),
      N('s.x = -s.x', 'Flip the picture to face the other way (copy, change, put back — that is how Unity wants it).', 'Отражаем картинку в другую сторону (копируем, меняем, кладём обратно — так требует Unity).'),
    ],
  },
  {
    id: 'spawner',
    lang: 'cs',
    kind: 'unity',
    title: T('Spawn enemies every few seconds', 'Создавать врагов каждые несколько секунд'),
    words: 'spawn spawner wave enemies timer instantiate спавн появление волна враги создавать таймер',
    about: T('Creates a prefab at a random point every N seconds.', 'Создаёт префаб в случайной точке каждые N секунд.'),
    code: `using UnityEngine;

public class Spawner : MonoBehaviour
{
    public GameObject prefab;
    public float every = 2f;
    public float width = 8f;

    private float timer;

    void Update()
    {
        timer += Time.deltaTime;
        if (timer >= every)
        {
            timer = 0f;
            Vector3 pos = transform.position + new Vector3(Random.Range(-width / 2, width / 2), 0, 0);
            Instantiate(prefab, pos, Quaternion.identity);
        }
    }
}`,
    notes: [N('timer += Time.deltaTime', 'A timer: add the time of each frame.', 'Таймер: добавляем время каждого кадра.'), N('Random.Range(', 'A random x within the width.', 'Случайный x в пределах ширины.')],
  },
  {
    id: 'timer-countdown',
    lang: 'cs',
    kind: 'unity',
    title: T('Countdown timer (time is up → game over)', 'Обратный отсчёт (время вышло → конец игры)'),
    words: 'timer countdown time limit clock таймер обратный отсчёт время секунды',
    about: T('Counts down from N seconds and reacts when the time is up.', 'Отсчитывает N секунд вниз и реагирует, когда время вышло.'),
    code: `using UnityEngine;

public class Countdown : MonoBehaviour
{
    public float seconds = 60f;
    private bool finished;

    void Update()
    {
        if (finished) return;
        seconds -= Time.deltaTime;
        if (seconds <= 0f)
        {
            seconds = 0f;
            finished = true;
            Debug.Log("Time is up!");
        }
    }
}`,
    notes: [N('if (finished) return;', 'Do not repeat the ending every frame after it happened.', 'Не повторяем финал каждый кадр после того, как он случился.')],
  },
  {
    id: 'restart',
    lang: 'cs',
    kind: 'unity',
    title: T('Restart the level / load the next level', 'Перезапустить уровень / загрузить следующий'),
    words: 'restart reload scene level next load scenemanager game over перезапуск уровень сцена следующий загрузить',
    about: T('R restarts the current scene; LoadNext() opens the next scene from Build Settings.', 'R перезапускает текущую сцену; LoadNext() открывает следующую сцену из Build Settings.'),
    setup: [T('File → Build Profiles (Build Settings) → add all your scenes in order.', 'File → Build Profiles (Build Settings) → добавь все сцены по порядку.')],
    code: `using UnityEngine;
using UnityEngine.SceneManagement;

public class LevelLoader : MonoBehaviour
{
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.R))
        {
            Restart();
        }
    }

    public void Restart()
    {
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }

    public void LoadNext()
    {
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex + 1);
    }
}`,
    notes: [N('using UnityEngine.SceneManagement;', 'Needed for SceneManager.', 'Нужно для SceneManager.'), N('buildIndex', 'The number of the scene in Build Settings.', 'Номер сцены в Build Settings.')],
  },
  {
    id: 'pause',
    lang: 'cs',
    kind: 'unity',
    title: T('Pause on Escape', 'Пауза на Escape'),
    words: 'pause menu escape timescale stop пауза меню остановить',
    about: T('Escape stops time and shows a pause panel; again — continues.', 'Escape останавливает время и показывает панель паузы; ещё раз — продолжает.'),
    code: `using UnityEngine;

public class PauseMenu : MonoBehaviour
{
    public GameObject pausePanel;
    private bool paused;

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Escape))
        {
            paused = !paused;
            Time.timeScale = paused ? 0f : 1f;
            pausePanel.SetActive(paused);
        }
    }
}`,
    notes: [N('paused = !paused', 'Flip: true ↔ false.', 'Переключатель: true ↔ false.'), N('Time.timeScale', '0 = time stops (Update still runs, but Time.deltaTime is 0).', '0 — время стоит (Update работает, но Time.deltaTime = 0).')],
  },
  {
    id: 'save-best',
    lang: 'cs',
    kind: 'unity',
    title: T('Save the best score (PlayerPrefs)', 'Сохранить лучший результат (PlayerPrefs)'),
    words: 'save load best record highscore playerprefs сохранить загрузить рекорд лучший',
    about: T('Remembers the best score even after the game is closed.', 'Запоминает лучший результат даже после закрытия игры.'),
    code: `using UnityEngine;

public class BestScore : MonoBehaviour
{
    public static void Submit(int score)
    {
        int best = PlayerPrefs.GetInt("best", 0);
        if (score > best)
        {
            PlayerPrefs.SetInt("best", score);
            PlayerPrefs.Save();
            Debug.Log("New record: " + score);
        }
    }
}`,
    notes: [N('GetInt("best", 0)', 'Read the saved number; 0 if nothing was saved yet.', 'Читаем сохранённое число; 0, если ещё ничего не сохраняли.')],
  },
  {
    id: 'destroy-after',
    lang: 'cs',
    kind: 'unity',
    title: T('Destroy an object after some seconds', 'Уничтожить объект через несколько секунд'),
    words: 'destroy remove after seconds lifetime timer удалить уничтожить через секунды время жизни',
    about: T('Removes the object N seconds after it appeared (explosions, bullets, effects).', 'Удаляет объект через N секунд после появления (взрывы, пули, эффекты).'),
    code: `using UnityEngine;

public class Lifetime : MonoBehaviour
{
    public float seconds = 2f;

    void Start()
    {
        Destroy(gameObject, seconds);
    }
}`,
    notes: [N('Destroy(gameObject, seconds)', 'The second number is a delay in seconds.', 'Второе число — задержка в секундах.')],
  },
  {
    id: 'coroutine',
    lang: 'cs',
    kind: 'unity',
    title: T('Do something with pauses (coroutine)', 'Сделать что-то с паузами (корутина)'),
    words: 'coroutine wait delay ienumerator yield waitforseconds корутина подождать задержка пауза',
    about: T('A coroutine can wait: blink 3 times with pauses, without freezing the game.', 'Корутина умеет ждать: мигнуть 3 раза с паузами, не замораживая игру.'),
    code: `using System.Collections;
using UnityEngine;

public class Blink : MonoBehaviour
{
    void Start()
    {
        StartCoroutine(BlinkThreeTimes());
    }

    IEnumerator BlinkThreeTimes()
    {
        SpriteRenderer sprite = GetComponent<SpriteRenderer>();
        for (int i = 0; i < 3; i++)
        {
            sprite.enabled = false;
            yield return new WaitForSeconds(0.2f);
            sprite.enabled = true;
            yield return new WaitForSeconds(0.2f);
        }
    }
}`,
    notes: [
      N('using System.Collections;', 'IEnumerator lives here.', 'Здесь живёт IEnumerator.'),
      N('StartCoroutine', 'A coroutine is started, not just called.', 'Корутину запускают, а не просто вызывают.'),
      N('yield return new WaitForSeconds', 'Wait here, the rest of the game keeps running.', 'Ждём здесь, а остальная игра продолжает работать.'),
    ],
  },
  {
    id: 'sound',
    lang: 'cs',
    kind: 'unity',
    title: T('Play a sound', 'Проиграть звук'),
    words: 'sound audio play sfx music звук аудио проиграть музыка эффект',
    about: T('Plays a sound effect once (jump, coin).', 'Проигрывает звуковой эффект один раз (прыжок, монета).'),
    setup: [T('Add an AudioSource component to the object and drag a sound file into "Clip" of the script.', 'Добавь объекту компонент AudioSource и перетащи звуковой файл в поле «Clip» скрипта.')],
    code: `using UnityEngine;

public class PlaySound : MonoBehaviour
{
    public AudioClip clip;
    private AudioSource source;

    void Awake()
    {
        source = GetComponent<AudioSource>();
    }

    public void Play()
    {
        source.PlayOneShot(clip);
    }
}`,
    notes: [N('PlayOneShot', 'Play without stopping other sounds of this source.', 'Проиграть, не останавливая другие звуки этого источника.')],
  },
  {
    id: 'animator',
    lang: 'cs',
    kind: 'unity',
    title: T('Switch animations (Animator)', 'Переключать анимации (Animator)'),
    words: 'animation animator run idle jump parameter анимация аниматор бег стоять параметр',
    about: T('Tells the Animator how fast the character runs and when it jumps.', 'Сообщает Animator, как быстро бежит персонаж и когда прыгает.'),
    setup: [T('In the Animator window create a Float parameter "Speed" and a Trigger "Jump" and use them in transitions.', 'В окне Animator создай параметр Float «Speed» и Trigger «Jump» и используй их в переходах.')],
    code: `using UnityEngine;

public class PlayerAnimation : MonoBehaviour
{
    private Animator animator;

    void Awake()
    {
        animator = GetComponent<Animator>();
    }

    void Update()
    {
        float x = Input.GetAxis("Horizontal");
        animator.SetFloat("Speed", Mathf.Abs(x));
        if (Input.GetKeyDown(KeyCode.Space))
        {
            animator.SetTrigger("Jump");
        }
    }
}`,
    notes: [N('SetFloat("Speed"', 'The name must match the parameter in the Animator exactly.', 'Имя должно точно совпадать с параметром в Animator.'), N('Mathf.Abs', 'Speed without direction: left and right are both "running".', 'Скорость без направления: и влево, и вправо — это «бег».')],
  },
  {
    id: 'button',
    lang: 'cs',
    kind: 'unity',
    title: T('A UI button that does something', 'Кнопка интерфейса, которая что-то делает'),
    words: 'button ui click menu start кнопка интерфейс нажатие меню старт',
    about: T('A public method you can choose in the button\'s On Click list.', 'Публичный метод, который можно выбрать в списке On Click у кнопки.'),
    setup: [T('GameObject → UI → Button. In On Click press +, drag the object with this script and choose MenuButtons → StartGame.', 'GameObject → UI → Button. В On Click нажми +, перетащи объект с этим скриптом и выбери MenuButtons → StartGame.')],
    code: `using UnityEngine;
using UnityEngine.SceneManagement;

public class MenuButtons : MonoBehaviour
{
    public void StartGame()
    {
        SceneManager.LoadScene("Game");
    }

    public void Quit()
    {
        Application.Quit();
        Debug.Log("Quit (works only in a built game)");
    }
}`,
    notes: [N('public void StartGame', 'Must be public and void to appear in On Click.', 'Должен быть public и void, чтобы появиться в On Click.')],
  },
  {
    id: 'health-bar',
    lang: 'cs',
    kind: 'unity',
    title: T('Health bar (UI Slider)', 'Полоска здоровья (UI Slider)'),
    words: 'health bar slider ui hp полоска здоровья слайдер хп',
    about: T('A slider that shows health from 0 to max.', 'Слайдер, который показывает здоровье от 0 до максимума.'),
    code: `using UnityEngine;
using UnityEngine.UI;

public class HealthBar : MonoBehaviour
{
    public Slider slider;

    public void Set(int health, int maxHealth)
    {
        slider.maxValue = maxHealth;
        slider.value = health;
    }
}`,
    notes: [N('using UnityEngine.UI;', 'Slider lives here.', 'Здесь живёт Slider.')],
  },
  {
    id: 'raycast',
    lang: 'cs',
    kind: 'unity',
    title: T('See what is in front (raycast)', 'Увидеть, что впереди (луч / raycast)'),
    words: 'raycast ray see wall ground front hit луч рейкаст видеть стена впереди',
    about: T('Shoots an invisible ray forward and reports what it hits.', 'Пускает невидимый луч вперёд и сообщает, во что он попал.'),
    code: `using UnityEngine;

public class LookAhead : MonoBehaviour
{
    public float distance = 3f;

    void Update()
    {
        RaycastHit2D hit = Physics2D.Raycast(transform.position, transform.right, distance);
        Debug.DrawRay(transform.position, transform.right * distance, Color.red);
        if (hit.collider != null)
        {
            Debug.Log("I see: " + hit.collider.name);
        }
    }
}`,
    notes: [N('Physics2D.Raycast', 'Start point, direction, length.', 'Начальная точка, направление, длина.'), N('Debug.DrawRay', 'Draws the ray in the Scene window, so you can see it.', 'Рисует луч в окне Scene, чтобы его было видно.')],
  },
  {
    id: 'door-key',
    lang: 'cs',
    kind: 'unity',
    title: T('Door that opens with a key', 'Дверь, которая открывается ключом'),
    words: 'door key open lock inventory дверь ключ открыть замок инвентарь',
    about: T('Pick up a key (tag Key), then touching the door opens it.', 'Подбери ключ (тег Key), и при касании дверь откроется.'),
    code: `using UnityEngine;

public class KeyHolder : MonoBehaviour
{
    private bool hasKey;

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Key"))
        {
            hasKey = true;
            Destroy(other.gameObject);
        }
        else if (other.CompareTag("Door") && hasKey)
        {
            other.gameObject.SetActive(false);
        }
    }
}`,
    notes: [N('private bool hasKey', 'A yes/no memory: do we have the key?', 'Память «да/нет»: есть ли ключ?'), N('SetActive(false)', 'Turn the door off — the way is open.', 'Выключаем дверь — путь открыт.')],
  },
  {
    id: 'scriptable',
    lang: 'cs',
    kind: 'unity',
    title: T('Item data as an asset (ScriptableObject)', 'Данные предмета как ассет (ScriptableObject)'),
    words: 'scriptableobject item data asset inventory weapon предмет данные ассет оружие инвентарь',
    about: T('Lets you create items (sword, potion) as files in the Project with their own settings.', 'Позволяет создавать предметы (меч, зелье) как файлы в Project со своими настройками.'),
    setup: [T('After saving: right-click in Project → Create → Game → Item.', 'После сохранения: правый клик в Project → Create → Game → Item.')],
    code: `using UnityEngine;

[CreateAssetMenu(menuName = "Game/Item")]
public class ItemData : ScriptableObject
{
    public string itemName = "Sword";
    public Sprite icon;
    public int damage = 5;
    public int price = 10;
}`,
    notes: [N('[CreateAssetMenu', 'Adds an item to the Create menu.', 'Добавляет пункт в меню Create.'), N(': ScriptableObject', 'Not a script on an object — a data file.', 'Не скрипт на объекте, а файл с данными.')],
  },
  // ============================================================== Unity: more game feel
  {
    id: 'double-jump',
    lang: 'cs',
    kind: 'unity',
    title: T('Double jump', 'Двойной прыжок'),
    words: 'double jump air jump second jump двойной прыжок второй в воздухе',
    about: T('Jump again once while in the air. Landing gives the jumps back.', 'Можно подпрыгнуть ещё раз в воздухе. При приземлении прыжки возвращаются.'),
    setup: [T('Rigidbody2D and Collider2D on the player; a "Ground Check" point at the feet; platforms on the layer "Ground".', 'Rigidbody2D и Collider2D на игроке; точка «Ground Check» у ног; платформы на слое «Ground».')],
    code: `using UnityEngine;

public class PlayerDoubleJump : MonoBehaviour
{
    public float jumpForce = 8f;
    public int extraJumps = 1;
    public Transform groundCheck;
    public LayerMask groundLayer;

    private Rigidbody2D rb;
    private int jumpsLeft;

    void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        bool onGround = Physics2D.OverlapCircle(groundCheck.position, 0.2f, groundLayer);
        if (onGround && rb.linearVelocity.y <= 0.01f) jumpsLeft = extraJumps;

        if (Input.GetKeyDown(KeyCode.Space) && (onGround || jumpsLeft > 0))
        {
            if (!onGround) jumpsLeft--;
            rb.linearVelocity = new Vector2(rb.linearVelocity.x, 0);
            rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
        }
    }
}`,
    notes: [
      N('public int extraJumps = 1;', 'How many jumps in the air. 2 = triple jump.', 'Сколько прыжков в воздухе. 2 — тройной прыжок.'),
      N('jumpsLeft = extraJumps;', 'On the ground the air jumps come back.', 'На земле прыжки в воздухе возвращаются.'),
      N('if (!onGround) jumpsLeft--;', 'Spend one air jump.', 'Тратим один прыжок в воздухе.'),
      N('rb.linearVelocity = new Vector2(rb.linearVelocity.x, 0);', 'Reset falling speed first, so the second jump is as high as the first.', 'Сначала обнуляем скорость падения — второй прыжок будет такой же высоты.'),
    ],
  },
  {
    id: 'dash',
    lang: 'cs',
    kind: 'unity',
    title: T('Dash with Shift (with cooldown)', 'Рывок на Shift (с перезарядкой)'),
    words: 'dash shift boost sprint cooldown рывок ускорение перезарядка дэш',
    about: T('A short burst of speed in the direction you move, then a pause before the next dash.', 'Короткий рывок в сторону движения, затем пауза до следующего рывка.'),
    code: `using System.Collections;
using UnityEngine;

public class PlayerDash : MonoBehaviour
{
    public float speed = 4f;
    public float dashSpeed = 16f;
    public float dashTime = 0.15f;
    public float cooldown = 1f;

    private bool dashing;
    private float nextDash;
    private float direction = 1f;

    void Update()
    {
        float x = Input.GetAxisRaw("Horizontal");
        if (x != 0) direction = x;
        if (!dashing) transform.Translate(x * speed * Time.deltaTime, 0, 0);

        if (Input.GetKeyDown(KeyCode.LeftShift) && Time.time >= nextDash)
        {
            StartCoroutine(Dash());
        }
    }

    IEnumerator Dash()
    {
        dashing = true;
        nextDash = Time.time + cooldown;
        float end = Time.time + dashTime;
        while (Time.time < end)
        {
            transform.Translate(direction * dashSpeed * Time.deltaTime, 0, 0);
            yield return null;
        }
        dashing = false;
    }
}`,
    notes: [
      N('if (x != 0) direction = x;', 'Remember the last direction, so a dash works even when standing.', 'Запоминаем последнее направление — рывок работает и стоя на месте.'),
      N('Time.time >= nextDash', 'Cooldown: no dash spam.', 'Перезарядка: нельзя рваться без остановки.'),
      N('yield return null;', 'Wait one frame and continue the loop — the dash lasts several frames.', 'Ждём один кадр и продолжаем цикл — рывок длится несколько кадров.'),
    ],
  },
  {
    id: 'respawn',
    lang: 'cs',
    kind: 'unity',
    title: T('Respawn at a checkpoint after falling', 'Возрождение на чекпоинте после падения'),
    words: 'respawn checkpoint fall die restart position возрождение чекпоинт падение упал точка сохранения',
    about: T('Remembers the start (or the last checkpoint) and moves the player back when he falls out of the level.', 'Запоминает старт (или последний чекпоинт) и возвращает игрока, если он упал с уровня.'),
    setup: [T('Checkpoints: objects with a trigger collider and the tag "Checkpoint".', 'Чекпоинты: объекты с триггер-коллайдером и тегом «Checkpoint».')],
    code: `using UnityEngine;

public class Respawn : MonoBehaviour
{
    public float fallLimit = -5f;
    private Vector3 respawnPoint;

    void Start()
    {
        respawnPoint = transform.position;
    }

    void Update()
    {
        if (transform.position.y < fallLimit)
        {
            transform.position = respawnPoint;
            Debug.Log("Respawn!");
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Checkpoint"))
        {
            respawnPoint = other.transform.position;
            Debug.Log("Checkpoint saved");
        }
    }
}`,
    notes: [
      N('respawnPoint = transform.position;', 'At the start the respawn point is where the player stands.', 'В начале точка возрождения — там, где стоит игрок.'),
      N('transform.position.y < fallLimit', 'Fell below the level?', 'Упал ниже уровня?'),
      N('respawnPoint = other.transform.position;', 'A new checkpoint replaces the old one.', 'Новый чекпоинт заменяет старый.'),
    ],
  },
  {
    id: 'enemy-shooter',
    lang: 'cs',
    kind: 'unity',
    title: T('Enemy that shoots at the player', 'Враг, который стреляет в игрока'),
    words: 'enemy shoot turret aim player bullet invokerepeating враг стреляет турель целится пушка',
    about: T('Every 1.5 seconds the enemy fires a bullet towards the player.', 'Каждые 1.5 секунды враг стреляет пулей в сторону игрока.'),
    setup: [T('Put on the enemy; drag a bullet prefab (Rigidbody2D, Gravity 0) into "Bullet Prefab".', 'Повесь на врага; перетащи префаб пули (Rigidbody2D, Gravity 0) в «Bullet Prefab».')],
    code: `using UnityEngine;

public class EnemyShooter : MonoBehaviour
{
    public Rigidbody2D bulletPrefab;
    public float bulletSpeed = 6f;
    public float every = 1.5f;

    private Transform player;

    void Start()
    {
        player = GameObject.FindWithTag("Player").transform;
        InvokeRepeating("Shoot", 1f, every);
    }

    void Shoot()
    {
        if (player == null) return;
        Vector2 direction = (player.position - transform.position).normalized;
        Rigidbody2D bullet = Instantiate(bulletPrefab, transform.position, Quaternion.identity);
        bullet.linearVelocity = direction * bulletSpeed;
        Destroy(bullet.gameObject, 4f);
    }
}`,
    notes: [
      N('InvokeRepeating("Shoot", 1f, every);', 'Call Shoot after 1 second, then every 1.5 seconds — no timer code needed.', 'Вызывать Shoot через 1 секунду, затем каждые 1.5 секунды — без своего таймера.'),
      N('.normalized', 'Direction of length 1: the bullet speed is the same near and far.', 'Направление длиной 1: скорость пули одинаковая и рядом, и далеко.'),
      N('Destroy(bullet.gameObject, 4f);', 'Missed bullets disappear after 4 seconds.', 'Промахнувшиеся пули исчезают через 4 секунды.'),
    ],
  },
  {
    id: 'homing',
    lang: 'cs',
    kind: 'unity',
    title: T('Homing enemy (turns and flies to the player)', 'Самонаводящийся враг (поворачивается и летит к игроку)'),
    words: 'homing missile follow rotate turn towards самонаводящийся ракета наведение поворот',
    about: T('Turns its nose to the player and flies forward — like a homing missile.', 'Поворачивается «носом» к игроку и летит вперёд — как самонаводящаяся ракета.'),
    code: `using UnityEngine;

public class HomingEnemy : MonoBehaviour
{
    public Transform target;
    public float speed = 2.5f;

    void Update()
    {
        if (target == null) return;
        Vector2 toTarget = target.position - transform.position;
        float angle = Mathf.Atan2(toTarget.y, toTarget.x) * Mathf.Rad2Deg;
        transform.rotation = Quaternion.Euler(0, 0, angle);
        transform.position = Vector2.MoveTowards(transform.position, target.position, speed * Time.deltaTime);
    }
}`,
    notes: [
      N('Mathf.Atan2(toTarget.y, toTarget.x)', 'The angle of the direction to the target (radians → degrees).', 'Угол направления на цель (радианы → градусы).'),
      N('Quaternion.Euler(0, 0, angle)', 'Turn around Z — in 2D that is "turn to face".', 'Поворот вокруг Z — в 2D это «развернуться лицом».'),
    ],
  },
  {
    id: 'waypoints',
    lang: 'cs',
    kind: 'unity',
    title: T('Follow a path of points (waypoints)', 'Движение по точкам маршрута (waypoints)'),
    words: 'waypoints path route points array patrol маршрут точки путь массив обход',
    about: T('An enemy or platform goes from point to point in a loop. Add as many points as you like in the Inspector.', 'Враг или платформа ходит от точки к точке по кругу. Точек можно добавить сколько угодно в Inspector.'),
    setup: [T('Create empty objects as points and drag them into the "Points" list.', 'Создай пустые объекты-точки и перетащи их в список «Points».')],
    code: `using UnityEngine;

public class EnemyWaypoints : MonoBehaviour
{
    public Transform[] points;
    public float speed = 3f;

    private int index;

    void Update()
    {
        if (points.Length == 0) return;
        Transform target = points[index];
        transform.position = Vector2.MoveTowards(transform.position, target.position, speed * Time.deltaTime);
        if (Vector2.Distance(transform.position, target.position) < 0.05f)
        {
            index = (index + 1) % points.Length;
        }
    }
}`,
    notes: [
      N('public Transform[] points;', 'An array: a list of points shown in the Inspector.', 'Массив: список точек, который видно в Inspector.'),
      N('index = (index + 1) % points.Length;', '% wraps around: after the last point comes point 0 again.', '% замыкает круг: после последней точки снова точка 0.'),
    ],
  },
  {
    id: 'typewriter',
    lang: 'cs',
    kind: 'unity',
    title: T('Dialogue text that types letter by letter', 'Текст диалога, который печатается по буквам'),
    words: 'typewriter dialogue text letters typing dialog npc печатная машинка диалог текст по буквам реплика',
    about: T('Shows a line of dialogue one letter at a time, like in RPGs.', 'Показывает реплику по одной букве, как в RPG.'),
    setup: [T('UI → Text - TextMeshPro; drag it into "Text".', 'UI → Text - TextMeshPro; перетащи его в поле «Text».')],
    code: `using System.Collections;
using UnityEngine;
using TMPro;

public class DialogueTyper : MonoBehaviour
{
    public TMP_Text text;
    public string message = "Hello, hero! Find the key.";
    public float letterDelay = 0.04f;

    void Start()
    {
        StartCoroutine(Type());
    }

    IEnumerator Type()
    {
        text.text = "";
        for (int i = 1; i <= message.Length; i++)
        {
            text.text = message.Substring(0, i);
            yield return new WaitForSeconds(letterDelay);
        }
    }
}`,
    notes: [
      N('message.Substring(0, i)', 'The first i letters of the message.', 'Первые i букв сообщения.'),
      N('yield return new WaitForSeconds(letterDelay);', 'A tiny pause after each letter.', 'Маленькая пауза после каждой буквы.'),
    ],
  },
  {
    id: 'regen',
    lang: 'cs',
    kind: 'unity',
    title: T('Health regeneration over time', 'Восстановление здоровья со временем'),
    words: 'regen regeneration heal over time health restore восстановление регенерация лечение здоровье',
    about: T('Adds 1 health every second, never above the maximum.', 'Добавляет 1 здоровья каждую секунду, но не больше максимума.'),
    code: `using UnityEngine;

public class HealthRegen : MonoBehaviour
{
    public int health = 3;
    public int maxHealth = 10;
    public float every = 1f;

    void Start()
    {
        InvokeRepeating("Regen", every, every);
    }

    void Regen()
    {
        if (health < maxHealth)
        {
            health++;
            Debug.Log("Health: " + health);
        }
    }
}`,
    notes: [N('InvokeRepeating("Regen", every, every);', 'Call Regen again and again, every second.', 'Вызывать Regen снова и снова, каждую секунду.'), N('if (health < maxHealth)', 'Never above the maximum.', 'Не больше максимума.')],
  },
  {
    id: 'coin-magnet',
    lang: 'cs',
    kind: 'unity',
    title: T('Coin magnet (coins fly to the player)', 'Магнит для монет (монеты летят к игроку)'),
    words: 'magnet coins attract pull collect магнит монеты притягивать собирать бонус',
    about: T('Coins closer than "radius" fly to the player.', 'Монеты ближе, чем «radius», летят к игроку.'),
    code: `using UnityEngine;

public class CoinMagnet : MonoBehaviour
{
    public float radius = 3f;
    public float pullSpeed = 6f;

    private GameObject[] coins;

    void Start()
    {
        coins = GameObject.FindGameObjectsWithTag("Coin");
    }

    void Update()
    {
        foreach (GameObject coin in coins)
        {
            if (coin == null) continue;
            float distance = Vector2.Distance(transform.position, coin.transform.position);
            if (distance < radius)
            {
                coin.transform.position = Vector2.MoveTowards(coin.transform.position, transform.position, pullSpeed * Time.deltaTime);
            }
        }
    }
}`,
    notes: [
      N('GameObject.FindGameObjectsWithTag("Coin")', 'Find all coins once, at the start (not every frame).', 'Находим все монеты один раз, в начале (а не каждый кадр).'),
      N('if (coin == null) continue;', 'A collected coin is gone — skip it.', 'Собранной монеты уже нет — пропускаем.'),
    ],
  },
  {
    id: 'combo',
    lang: 'cs',
    kind: 'unity',
    title: T('Combo counter (resets if you are slow)', 'Комбо-счётчик (сбрасывается, если медлишь)'),
    words: 'combo multiplier streak chain score bonus комбо множитель серия очки бонус',
    about: T('Each coin within 2 seconds of the previous one raises the combo; points = combo.', 'Каждая монета в течение 2 секунд после предыдущей увеличивает комбо; очки = комбо.'),
    code: `using UnityEngine;

public class ComboCounter : MonoBehaviour
{
    public float comboTime = 2f;
    public int combo;
    public int score;

    private float timer;

    void Update()
    {
        if (combo > 0)
        {
            timer -= Time.deltaTime;
            if (timer <= 0)
            {
                combo = 0;
                Debug.Log("Combo lost");
            }
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            combo++;
            score += combo;
            timer = comboTime;
            Destroy(other.gameObject);
            Debug.Log("Combo x" + combo + ", score " + score);
        }
    }
}`,
    notes: [
      N('score += combo;', 'The longer the chain, the more each coin is worth.', 'Чем длиннее серия, тем дороже каждая монета.'),
      N('timer = comboTime;', 'Every coin gives 2 more seconds.', 'Каждая монета даёт ещё 2 секунды.'),
    ],
  },
  {
    id: 'collect-all',
    lang: 'cs',
    kind: 'unity',
    title: T('Win when all coins are collected', 'Победа, когда собраны все монеты'),
    words: 'win victory all coins collected level complete goal победа все монеты собраны уровень пройден цель',
    about: T('Checks how many coins are left and says "Victory!" once.', 'Проверяет, сколько монет осталось, и один раз пишет «Победа!».'),
    code: `using UnityEngine;

public class CoinGoal : MonoBehaviour
{
    private bool won;

    void Update()
    {
        if (won) return;
        int left = GameObject.FindGameObjectsWithTag("Coin").Length;
        if (left == 0)
        {
            won = true;
            Debug.Log("Victory! All coins collected");
        }
    }
}`,
    notes: [N('if (won) return;', 'Say it only once.', 'Сообщаем только один раз.'), N('.Length', 'How many coins are still on the level.', 'Сколько монет ещё на уровне.')],
  },
  {
    id: 'enemy-turn',
    lang: 'cs',
    kind: 'unity',
    title: T('Enemy turns around in front of obstacles (raycast)', 'Враг разворачивается перед препятствием (луч)'),
    words: 'enemy turn around wall obstacle raycast ahead patrol враг разворот стена препятствие луч',
    about: T('Walks forward and looks ahead with a ray; when something is in the way, turns around.', 'Идёт вперёд и смотрит лучом перед собой; если что-то мешает — разворачивается.'),
    code: `using UnityEngine;

public class EnemyTurnAround : MonoBehaviour
{
    public float speed = 2f;
    public float lookAhead = 0.8f;

    private float direction = 1f;

    void Update()
    {
        transform.Translate(direction * speed * Time.deltaTime, 0, 0);
        Vector2 ahead = new Vector2(direction, 0);
        RaycastHit2D hit = Physics2D.Raycast(transform.position, ahead, lookAhead);
        Debug.DrawRay(transform.position, ahead * lookAhead, Color.yellow);
        if (hit.collider != null)
        {
            direction = -direction;
            Vector3 s = transform.localScale;
            s.x = direction;
            transform.localScale = s;
        }
    }
}`,
    notes: [
      N('Physics2D.Raycast(transform.position, ahead, lookAhead)', 'A short ray in front of the enemy.', 'Короткий луч перед врагом.'),
      N('direction = -direction;', 'Something in the way → walk the other way.', 'Что-то мешает → идём в другую сторону.'),
    ],
  },
  // ============================================================== Console C#
  {
    id: 'cs-hello-input',
    lang: 'cs',
    kind: 'console',
    title: T('Ask a name and greet (console C#)', 'Спросить имя и поздороваться (консольный C#)'),
    words: 'console hello name input readline greet консоль привет имя ввод спросить',
    about: T('The smallest interactive program.', 'Самая маленькая программа с вводом.'),
    code: `using System;

Console.Write("What is your name? ");
string name = Console.ReadLine();
Console.WriteLine("Hello, " + name + "!");`,
    notes: [N('Console.ReadLine()', 'Waits for the person to type and press Enter.', 'Ждёт, пока человек напишет и нажмёт Enter.')],
  },
  {
    id: 'cs-guess',
    lang: 'cs',
    kind: 'console',
    title: T('Game "Guess the number" (console C#)', 'Игра «Угадай число» (консольный C#)'),
    words: 'guess number game random loop угадай число игра случайное цикл',
    about: T('The computer picks a number, you guess, it says "more" or "less".', 'Компьютер загадывает число, ты угадываешь, он говорит «больше» или «меньше».'),
    code: `using System;

Random random = new Random();
int secret = random.Next(1, 11);
int tries = 0;
while (true)
{
    Console.Write("Your guess (1-10): ");
    int guess = int.Parse(Console.ReadLine());
    tries++;
    if (guess < secret) Console.WriteLine("More!");
    else if (guess > secret) Console.WriteLine("Less!");
    else
    {
        Console.WriteLine("Right! Tries: " + tries);
        break;
    }
}`,
    notes: [
      N('random.Next(1, 11)', 'From 1 to 10 (the second number is not included).', 'От 1 до 10 (второе число не входит).'),
      N('while (true)', 'Repeat forever… until break.', 'Повторять бесконечно… пока не break.'),
      N('int.Parse', 'Text from the keyboard → number.', 'Текст с клавиатуры → число.'),
      N('break;', 'Guessed → leave the loop.', 'Угадали → выходим из цикла.'),
    ],
  },
  {
    id: 'cs-list',
    lang: 'cs',
    kind: 'console',
    title: T('Inventory list: add, remove, show (console C#)', 'Инвентарь-список: добавить, убрать, показать (консольный C#)'),
    words: 'list inventory items add remove foreach список инвентарь предметы добавить убрать',
    about: T('Working with List<string>: the basis of inventories.', 'Работа со списком List<string> — основа инвентарей.'),
    code: `using System;
using System.Collections.Generic;

List<string> inventory = new List<string>();
inventory.Add("sword");
inventory.Add("shield");
inventory.Add("potion");
inventory.Remove("shield");
Console.WriteLine("Items: " + inventory.Count);
foreach (string item in inventory)
{
    Console.WriteLine("- " + item);
}`,
    notes: [N('using System.Collections.Generic;', 'List lives here.', 'Здесь живёт List.'), N('foreach', 'Each item in turn.', 'Каждый предмет по очереди.')],
  },
  {
    id: 'cs-class',
    lang: 'cs',
    kind: 'console',
    title: T('Your own class: an enemy with health (console C#)', 'Свой класс: враг со здоровьем (консольный C#)'),
    words: 'class object constructor method oop класс объект конструктор метод ооп',
    about: T('A class is a blueprint; new makes objects from it.', 'Класс — это чертёж; new создаёт по нему объекты.'),
    code: `using System;

Enemy slime = new Enemy("Slime", 5);
slime.Hit(2);
slime.Hit(4);

class Enemy
{
    public string Name;
    public int Health;

    public Enemy(string name, int health)
    {
        Name = name;
        Health = health;
    }

    public void Hit(int damage)
    {
        Health -= damage;
        if (Health <= 0) Console.WriteLine(Name + " is defeated!");
        else Console.WriteLine(Name + " has " + Health + " HP");
    }
}`,
    notes: [N('public Enemy(string name', 'The constructor: runs when new Enemy(...) is made.', 'Конструктор: выполняется при new Enemy(...).'), N('Health -= damage', 'Minus the damage.', 'Минус урон.')],
  },
  // ============================================================== Unreal / C++ / C
  {
    id: 'ue-actor-move',
    lang: 'cpp',
    kind: 'unreal',
    title: T('Unreal: an Actor that moves every frame (C++)', 'Unreal: Actor, который двигается каждый кадр (C++)'),
    words: 'unreal actor tick move c++ ue5 анриал актор движение тик',
    about: T('The Unreal version of "Update + transform.Translate". Tick = Update, DeltaTime = Time.deltaTime.', 'Версия Unreal для «Update + transform.Translate». Tick = Update, DeltaTime = Time.deltaTime.'),
    code: `// MovingActor.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MovingActor.generated.h"

UCLASS()
class AMovingActor : public AActor
{
    GENERATED_BODY()
public:
    AMovingActor();
    virtual void Tick(float DeltaTime) override;

    UPROPERTY(EditAnywhere)
    float Speed = 100.f;
};

// MovingActor.cpp
#include "MovingActor.h"

AMovingActor::AMovingActor()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AMovingActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    FVector Location = GetActorLocation();
    Location.X += Speed * DeltaTime;
    SetActorLocation(Location);
}`,
    notes: [
      N('UCLASS()', 'Tells Unreal about this class (editor, Blueprints).', 'Сообщает Unreal об этом классе (редактор, Blueprints).'),
      N('UPROPERTY(EditAnywhere)', 'Like public in Unity: visible in the Details panel.', 'Как public в Unity: видно в панели Details.'),
      N('bCanEverTick = true', 'Without this Tick is never called.', 'Без этого Tick никогда не вызывается.'),
      N('Super::Tick', 'Let the parent class do its work first.', 'Сначала даём родительскому классу сделать своё.'),
    ],
  },
  {
    id: 'cpp-hello',
    lang: 'cpp',
    kind: 'program',
    title: T('C++: ask a number and answer', 'C++: спросить число и ответить'),
    words: 'c++ cpp cout cin hello number input вывод ввод число',
    about: T('Basic input/output in C++.', 'Базовый ввод/вывод в C++.'),
    code: `#include <iostream>
#include <string>

int main()
{
    std::string name;
    std::cout << "Your name: ";
    std::cin >> name;
    std::cout << "Hello, " << name << "!" << std::endl;
    return 0;
}`,
    notes: [N('std::cin >> name', 'Read a word from the keyboard into name.', 'Читаем слово с клавиатуры в name.'), N('return 0;', '0 = the program finished fine.', '0 — программа завершилась нормально.')],
  },
  {
    id: 'c-loop',
    lang: 'c',
    kind: 'program',
    title: T('C: count with a loop and printf', 'C: счёт в цикле и printf'),
    words: 'c printf loop for count си цикл счёт вывод',
    about: T('A for loop and formatted output in C.', 'Цикл for и форматный вывод в C.'),
    code: `#include <stdio.h>

int main(void)
{
    for (int i = 1; i <= 5; i++)
    {
        printf("Step %d of 5\\n", i);
    }
    return 0;
}`,
    notes: [N('%d', 'A place for a whole number.', 'Место для целого числа.')],
  },
  // ============================================================== Python / JS
  {
    id: 'py-guess',
    lang: 'py',
    kind: 'program',
    title: T('Python: "Guess the number"', 'Python: «Угадай число»'),
    words: 'python guess number game random угадай число игра питон',
    about: T('The same game in Python.', 'Та же игра на Python.'),
    code: `import random

secret = random.randint(1, 10)
while True:
    guess = int(input("Your guess (1-10): "))
    if guess < secret:
        print("More!")
    elif guess > secret:
        print("Less!")
    else:
        print("Right!")
        break`,
    notes: [N('random.randint(1, 10)', 'From 1 to 10, both included.', 'От 1 до 10, оба включены.'), N('while True:', 'Repeat until break.', 'Повторять до break.')],
  },
  {
    id: 'py-list',
    lang: 'py',
    kind: 'program',
    title: T('Python: list of items and a loop', 'Python: список предметов и цикл'),
    words: 'python list loop for append список цикл питон',
    about: T('Lists and for-loops in Python.', 'Списки и цикл for в Python.'),
    code: `items = ["sword", "shield"]
items.append("potion")
for item in items:
    print("-", item)
print("Total:", len(items))`,
    notes: [N('append', 'Add to the end.', 'Добавить в конец.')],
  },
  {
    id: 'js-click',
    lang: 'js',
    kind: 'program',
    title: T('JavaScript: count to 5 and sum', 'JavaScript: досчитать до 5 и сложить'),
    words: 'javascript js loop sum console log цикл сумма',
    about: T('A loop and a sum in JavaScript.', 'Цикл и сумма в JavaScript.'),
    code: `let sum = 0;
for (let i = 1; i <= 5; i++) {
  sum += i;
  console.log("i =", i, "sum =", sum);
}`,
    notes: [N('sum += i', 'Add i to the sum.', 'Добавить i к сумме.')],
  },
];

// ------------------------------------------------------------------------------------- search

const RU_ENDINGS = /(ями|ами|ого|его|ому|ему|ыми|ими|ией|ия|ие|ий|ый|ой|ая|яя|ое|ее|ые|ие|ую|юю|ам|ям|ах|ях|ом|ем|ов|ев|ей|ть|ти|ешь|ет|ут|ют|ит|ат|ят|ла|ло|ли|ся|сь|а|я|о|е|ы|и|у|ю|ь)$/;

/** Rough stem: "монетки" ≈ "монет", "прыгать" ≈ "прыга". */
export function stem(w: string): string {
  w = w.toLowerCase().replace(/ё/g, 'е');
  if (/[а-я]/.test(w) && w.length > 4) {
    w = w.replace(RU_ENDINGS, '');
  } else if (w.length > 4) w = w.replace(/(ing|ed|es|s)$/, '');
  return w;
}

const SYNONYMS: Record<string, string[]> = {
  прыг: ['jump'],
  монет: ['coin'],
  ход: ['move'],
  двиг: ['move'],
  бег: ['move', 'run'],
  стрел: ['shoot'],
  пул: ['bullet'],
  враг: ['enemy'],
  камер: ['camera'],
  жизн: ['health'],
  здоров: ['health'],
  сохран: ['save'],
  звук: ['sound'],
  кнопк: ['button'],
  таймер: ['timer'],
  пауз: ['pause'],
  уровен: ['level'],
};

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-zа-яё0-9#+]+/i)
    .filter((w) => w.length > 1)
    .map(stem);
}

/** Recipes best matching a free-text wish ("хочу чтобы персонаж прыгал"). */
export function searchRecipes(query: string, lang?: EditLang): Recipe[] {
  const q = words(query).filter((w) => !['хоч', 'хочу', 'чтоб', 'чтобы', 'как', 'сдела', 'want', 'make', 'how', 'the', 'and', 'мне', 'мой', 'мо', 'на', 'по', 'для'].includes(w));
  const expanded = q.flatMap((w) => [w, ...Object.entries(SYNONYMS).filter(([k]) => w.startsWith(k)).flatMap(([, v]) => v)]);
  const scored = RECIPES.map((r) => {
    const hay = words(`${r.title.en} ${r.title.ru} ${r.words}`);
    let score = 0;
    for (const w of expanded) if (hay.some((h) => h.startsWith(w) || (w.length > 3 && w.startsWith(h)))) score += 2;
    if (lang && r.lang === lang) score += expanded.length ? 1 : 3;
    return { r, score };
  });
  const min = expanded.length ? 2 : 0;
  return scored
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Notes for each line of the code (a line may have several; each note is used once). */
function notesPerLine(r: Recipe): string[][] {
  const used = new Set<number>();
  return r.code.split('\n').map((line) =>
    r.notes.flatMap(([m, t], k) => {
      if (used.has(k) || !line.includes(m)) return [];
      used.add(k);
      return [pick(t)];
    }),
  );
}

/** The recipe's code with its explanations written as comments above the lines (current language). */
export function recipeWithComments(r: Recipe): string {
  const comment = r.lang === 'py' ? '#' : '//';
  const notes = notesPerLine(r);
  return r.code
    .split('\n')
    .flatMap((line, i) => {
      const indent = /^\s*/.exec(line)![0];
      return [...notes[i].map((n) => `${indent}${comment} ${n}`), line];
    })
    .join('\n');
}

/** Explanation for each line of the recipe ('' when none), for the line-by-line view. */
export function recipeLineNotes(r: Recipe): string[] {
  return notesPerLine(r).map((n) => n.join(' '));
}

/** File name a Unity/Unreal recipe expects (class name), e.g. "PlayerMove.cs". */
export function recipeFileName(r: Recipe): string {
  const cls = /class\s+(\w+)/.exec(r.code)?.[1];
  if (r.lang === 'cs') return `${(r.kind === 'unity' && cls) || 'Program'}.cs`;
  if (r.lang === 'py') return 'main.py';
  if (r.lang === 'js') return 'main.js';
  if (r.lang === 'c') return 'main.c';
  return r.kind === 'unreal' ? `${/class\s+(A\w+)/.exec(r.code)?.[1]?.slice(1) ?? 'Actor'}.cpp` : 'main.cpp';
}
