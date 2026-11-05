// "Find the bug" — real mistakes people make in Unity scripts. Each case starts from the SYMPTOM
// you would see in Unity ("the player does not move"), you tap the wrong line, then read why and
// see the fixed line. The wrong line is marked with //! in the source below (the marker is removed
// before showing). Tests check every case: the marked line exists, the fix is valid C#, and for the
// mistakes the live checks know, the checks flag exactly that line.

import type { Text2 } from '../i18n';

export interface BugCase {
  id: string;
  level: 1 | 2 | 3;
  /** What you would notice in Unity. */
  symptom: Text2;
  file: string;
  code: string;
  /** Replacement for the wrong line. */
  fix: string;
  hint: Text2;
  why: Text2;
  /** The Workshop's live checks find this one too. */
  lint?: boolean;
}

const T = (en: string, ru: string): Text2 => ({ en, ru });

export const BUGS: BugCase[] = [
  {
    id: 'lower-update',
    level: 1,
    symptom: T('The player does not move at all. No errors in the Console.', 'Игрок вообще не двигается. В Console ошибок нет.'),
    file: 'Player.cs',
    code: `using UnityEngine;

public class Player : MonoBehaviour
{
    public float speed = 5f;

    void update() //!
    {
        float x = Input.GetAxis("Horizontal");
        transform.Translate(x * speed * Time.deltaTime, 0, 0);
    }
}`,
    fix: '    void Update()',
    hint: T('Unity calls methods by their exact name.', 'Unity вызывает методы по точному имени.'),
    why: T('C# cares about capital letters. Unity looks for "Update"; "update" is just your own method that nobody calls — so there is no error, it silently does nothing.', 'C# различает большие и маленькие буквы. Unity ищет «Update»; «update» — просто твой метод, который никто не вызывает. Поэтому ошибки нет — он молча ничего не делает.'),
    lint: true,
  },
  {
    id: 'cs1612',
    level: 1,
    symptom: T('Error CS1612: Cannot modify the return value of "Transform.position".', 'Ошибка CS1612: Cannot modify the return value of "Transform.position".'),
    file: 'Jumper.cs',
    code: `using UnityEngine;

public class Jumper : MonoBehaviour
{
    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space))
        {
            transform.position.y += 1f; //!
        }
    }
}`,
    fix: '            transform.position += new Vector3(0, 1f, 0);',
    hint: T('position gives you a copy.', 'position отдаёт копию.'),
    why: T('transform.position is a struct: reading it gives a copy, so changing only .y of the copy is forbidden. Change the whole vector (or copy, change, put back).', 'transform.position — это структура: при чтении получаешь копию, менять только .y у копии нельзя. Меняй вектор целиком (или скопируй, измени и положи обратно).'),
    lint: true,
  },
  {
    id: 'assign-in-if',
    level: 1,
    symptom: T('Error CS0029: Cannot implicitly convert type "int" to "bool".', 'Ошибка CS0029: Cannot implicitly convert type "int" to "bool".'),
    file: 'Lives.cs',
    code: `using UnityEngine;

public class Lives : MonoBehaviour
{
    public int lives = 3;

    void Update()
    {
        if (lives = 0) //!
        {
            Debug.Log("Game over");
        }
    }
}`,
    fix: '        if (lives == 0)',
    hint: T('Look closely at the comparison.', 'Посмотри внимательно на сравнение.'),
    why: T('One = PUTS a value into the box, == COMPARES. An if needs a comparison.', 'Один = КЛАДЁТ значение в коробку, == СРАВНИВАЕТ. Для if нужно сравнение.'),
    lint: true,
  },
  {
    id: 'missing-f',
    level: 1,
    symptom: T('Error CS0664: Literal of type double cannot be implicitly converted to type "float".', 'Ошибка CS0664: Literal of type double cannot be implicitly converted to type "float".'),
    file: 'Mover.cs',
    code: `using UnityEngine;

public class Mover : MonoBehaviour
{
    public float speed = 2.5; //!

    void Update()
    {
        transform.Translate(speed * Time.deltaTime, 0, 0);
    }
}`,
    fix: '    public float speed = 2.5f;',
    hint: T('A number with a point is a double unless…', 'Число с точкой — это double, если только…'),
    why: T('2.5 is a double. float numbers need the letter f: 2.5f. Unity uses float almost everywhere.', '2.5 — это double. Для float нужна буква f: 2.5f. В Unity почти везде float.'),
    lint: true,
  },
  {
    id: 'if-semicolon',
    level: 2,
    symptom: T('The player jumps every frame, even without pressing Space.', 'Игрок прыгает каждый кадр, даже без нажатия пробела.'),
    file: 'Jump.cs',
    code: `using UnityEngine;

public class Jump : MonoBehaviour
{
    public Rigidbody2D rb;

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.Space)); //!
        {
            rb.AddForce(Vector2.up * 5f, ForceMode2D.Impulse);
        }
    }
}`,
    fix: '        if (Input.GetKeyDown(KeyCode.Space))',
    hint: T('Something tiny at the end of a line.', 'Что-то крошечное в конце строки.'),
    why: T('The ; right after if (…) ends the if. The block below is then just a normal block that runs ALWAYS.', '«;» сразу после if (…) завершает if. Блок ниже становится обычным блоком, который выполняется ВСЕГДА.'),
    lint: true,
  },
  {
    id: 'debug-lower',
    level: 1,
    symptom: T('Error CS0117: "Debug" does not contain a definition for "log".', 'Ошибка CS0117: "Debug" does not contain a definition for "log".'),
    file: 'Hello.cs',
    code: `using UnityEngine;

public class Hello : MonoBehaviour
{
    void Start()
    {
        Debug.log("Hello!"); //!
    }
}`,
    fix: '        Debug.Log("Hello!");',
    hint: T('Big and small letters.', 'Большие и маленькие буквы.'),
    why: T('It is Debug.Log with a capital L. In C# methods usually start with a capital letter.', 'Правильно Debug.Log с большой L. В C# методы обычно начинаются с большой буквы.'),
    lint: true,
  },
  {
    id: 'trigger-3d',
    level: 2,
    symptom: T('Coins are never collected in a 2D game. No errors.', 'В 2D-игре монеты не собираются. Ошибок нет.'),
    file: 'Collector.cs',
    code: `using UnityEngine;

public class Collector : MonoBehaviour
{
    public int coins;

    void OnTriggerEnter2D(Collider other) //!
    {
        if (other.CompareTag("Coin"))
        {
            coins++;
            Destroy(other.gameObject);
        }
    }
}`,
    fix: '    void OnTriggerEnter2D(Collider2D other)',
    hint: T('2D methods want 2D types.', '2D-методам нужны 2D-типы.'),
    why: T('OnTriggerEnter2D must receive a Collider2D. With the 3D Collider type Unity does not recognise the method and never calls it.', 'OnTriggerEnter2D должен получать Collider2D. С 3D-типом Collider Unity не узнаёт метод и никогда его не вызывает.'),
    lint: true,
  },
  {
    id: 'no-deltatime',
    level: 2,
    symptom: T('On a fast PC the player runs much faster than on a slow one.', 'На быстром ПК игрок бегает намного быстрее, чем на медленном.'),
    file: 'Runner.cs',
    code: `using UnityEngine;

public class Runner : MonoBehaviour
{
    public float speed = 0.1f;

    void Update()
    {
        transform.Translate(speed, 0, 0); //!
    }
}`,
    fix: '        transform.Translate(speed * Time.deltaTime, 0, 0);',
    hint: T('Update runs a different number of times per second on different computers.', 'Update выполняется разное число раз в секунду на разных компьютерах.'),
    why: T('Moving a fixed amount every frame means more frames = more distance. Multiply by Time.deltaTime (seconds per frame) to get "units per second" (and raise speed to ~5).', 'Если каждый кадр сдвигаться на одно и то же, то больше кадров = больше расстояние. Умножай на Time.deltaTime (секунды на кадр) — получится «единиц в секунду» (а speed подними до ~5).'),
    lint: true,
  },
  {
    id: 'getcomponent-update',
    level: 2,
    symptom: T('The game gets slower as more enemies appear (the Profiler shows GetComponent).', 'Игра тормозит, когда врагов становится больше (Profiler показывает GetComponent).'),
    file: 'Enemy.cs',
    code: `using UnityEngine;

public class Enemy : MonoBehaviour
{
    void Update()
    {
        Rigidbody2D rb = GetComponent<Rigidbody2D>(); //!
        rb.linearVelocity = Vector2.left * 2f;
    }
}`,
    fix: '        Rigidbody2D rb = cachedBody; // found once in Awake: cachedBody = GetComponent<Rigidbody2D>();',
    hint: T('Something here is searched again 60 times per second.', 'Здесь что-то ищется заново 60 раз в секунду.'),
    why: T('GetComponent searches the object every frame. Find it once (Awake/Start), keep it in a field, use the field in Update.', 'GetComponent ищет компонент каждый кадр. Найди его один раз (в Awake/Start), сохрани в поле и используй поле в Update.'),
    lint: true,
  },
  {
    id: 'while-update',
    level: 3,
    symptom: T('Unity freezes completely when Play is pressed.', 'Unity полностью зависает при нажатии Play.'),
    file: 'Waiter.cs',
    code: `using UnityEngine;

public class Waiter : MonoBehaviour
{
    float timer;

    void Update()
    {
        while (timer < 3f) //!
        {
            Debug.Log("waiting");
        }
    }
}`,
    fix: '        if (timer < 3f)',
    hint: T('Update itself is already repeated every frame.', 'Update и так повторяется каждый кадр.'),
    why: T('The while loop never ends: timer never changes inside it, and the frame cannot finish, so Unity freezes. Use if (and add timer += Time.deltaTime), or a coroutine.', 'Цикл while никогда не заканчивается: timer внутри не меняется, кадр не может закончиться — Unity зависает. Используй if (и добавь timer += Time.deltaTime) или корутину.'),
    lint: true,
  },
  {
    id: 'new-monobehaviour',
    level: 3,
    symptom: T('Warning: "You are trying to create a MonoBehaviour using the new keyword".', 'Предупреждение: "You are trying to create a MonoBehaviour using the new keyword".'),
    file: 'Spawner.cs',
    code: `using UnityEngine;

public class Spawner : MonoBehaviour
{
    void Start()
    {
        Coin coin = new Coin(); //!
    }
}

public class Coin : MonoBehaviour
{
}`,
    fix: '        Coin coin = gameObject.AddComponent<Coin>();',
    hint: T('Scripts live on objects.', 'Скрипты живут на объектах.'),
    why: T('A MonoBehaviour must be attached to a GameObject: AddComponent<T>() or Instantiate a prefab. new creates a broken script that Unity does not run.', 'MonoBehaviour должен висеть на GameObject: AddComponent<T>() или Instantiate префаба. new создаёт «сломанный» скрипт, который Unity не запускает.'),
    lint: true,
  },
  {
    id: 'shadowed-field',
    level: 3,
    symptom: T('NullReferenceException in Update, although GetComponent is called in Start.', 'NullReferenceException в Update, хотя GetComponent вызывается в Start.'),
    file: 'Player.cs',
    code: `using UnityEngine;

public class Player : MonoBehaviour
{
    private Rigidbody2D rb;

    void Start()
    {
        Rigidbody2D rb = GetComponent<Rigidbody2D>(); //!
    }

    void Update()
    {
        rb.linearVelocity = new Vector2(Input.GetAxis("Horizontal") * 5f, rb.linearVelocity.y);
    }
}`,
    fix: '        rb = GetComponent<Rigidbody2D>();',
    hint: T('Two boxes with the same name.', 'Две коробки с одинаковым именем.'),
    why: T('Writing the type again creates a NEW local variable rb that lives only inside Start. The field rb stays null. Remove the type to fill the field.', 'Если снова написать тип, создаётся НОВАЯ локальная переменная rb, живущая только внутри Start. Поле rb остаётся null. Убери тип — тогда заполнится поле.'),
  },
  {
    id: 'getkey-jump',
    level: 1,
    symptom: T('Holding Space makes the player fly away into the sky.', 'Если держать пробел, игрок улетает в небо.'),
    file: 'Jump.cs',
    code: `using UnityEngine;

public class Jump : MonoBehaviour
{
    public Rigidbody2D rb;

    void Update()
    {
        if (Input.GetKey(KeyCode.Space)) //!
        {
            rb.AddForce(Vector2.up * 5f, ForceMode2D.Impulse);
        }
    }
}`,
    fix: '        if (Input.GetKeyDown(KeyCode.Space))',
    hint: T('There are three GetKey methods.', 'Есть три метода GetKey.'),
    why: T('GetKey is true in EVERY frame while the key is held — a new push each frame. GetKeyDown is true only in the one frame of pressing.', 'GetKey истинно в КАЖДОМ кадре, пока клавиша зажата, — каждый кадр новый толчок. GetKeyDown истинно только в кадр нажатия.'),
  },
  {
    id: 'destroy-collider',
    level: 2,
    symptom: T('Coins stay visible after being "collected", but you cannot collect them again.', 'Монеты остаются видимыми после «сбора», но собрать их снова нельзя.'),
    file: 'Collector.cs',
    code: `using UnityEngine;

public class Collector : MonoBehaviour
{
    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("Coin"))
        {
            Destroy(other); //!
        }
    }
}`,
    fix: '            Destroy(other.gameObject);',
    hint: T('What exactly is "other"?', 'Что именно такое «other»?'),
    why: T('other is the Collider2D component. Destroy(other) removes only the collider; the coin (GameObject) stays. Destroy(other.gameObject) removes the whole coin.', 'other — это компонент Collider2D. Destroy(other) удаляет только коллайдер, а монета (GameObject) остаётся. Destroy(other.gameObject) удаляет монету целиком.'),
  },
  {
    id: 'random-range',
    level: 2,
    symptom: T('Sometimes: IndexOutOfRangeException when spawning.', 'Иногда: IndexOutOfRangeException при спавне.'),
    file: 'Spawner.cs',
    code: `using UnityEngine;

public class Spawner : MonoBehaviour
{
    public Transform[] points;
    public GameObject prefab;

    void Spawn()
    {
        int i = Random.Range(0, points.Length + 1); //!
        Instantiate(prefab, points[i].position, Quaternion.identity);
    }
}`,
    fix: '        int i = Random.Range(0, points.Length);',
    hint: T('For whole numbers the maximum of Random.Range is…', 'Для целых чисел максимум Random.Range…'),
    why: T('Random.Range(int, int) never returns the max itself. Random.Range(0, points.Length) already covers every index 0 … Length-1. +1 sometimes gives Length — one past the end.', 'Random.Range(int, int) никогда не возвращает сам максимум. Random.Range(0, points.Length) уже даёт все номера 0 … Length-1. +1 иногда даёт Length — на один дальше конца.'),
  },
  {
    id: 'off-by-one',
    level: 2,
    symptom: T('IndexOutOfRangeException at the end of the loop.', 'IndexOutOfRangeException в конце цикла.'),
    file: 'Wave.cs',
    code: `using UnityEngine;

public class Wave : MonoBehaviour
{
    public GameObject[] enemies;

    void Start()
    {
        for (int i = 0; i <= enemies.Length; i++) //!
        {
            enemies[i].SetActive(true);
        }
    }
}`,
    fix: '        for (int i = 0; i < enemies.Length; i++)',
    hint: T('Indexes start at 0.', 'Номера начинаются с 0.'),
    why: T('An array of 3 has indexes 0, 1, 2. With <= the loop also tries index 3, which does not exist.', 'У массива из 3 элементов номера 0, 1, 2. С <= цикл пробует ещё и номер 3, которого нет.'),
  },
  {
    id: 'float-equals',
    level: 2,
    symptom: T('"Time is up" never appears.', '«Time is up» никогда не появляется.'),
    file: 'Timer.cs',
    code: `using UnityEngine;

public class Timer : MonoBehaviour
{
    float timer;

    void Update()
    {
        timer += Time.deltaTime;
        if (timer == 3f) //!
        {
            Debug.Log("Time is up");
        }
    }
}`,
    fix: '        if (timer >= 3f)',
    hint: T('timer grows by 0.0166… each frame.', 'timer растёт на 0.0166… каждый кадр.'),
    why: T('timer jumps from 2.99… straight to 3.00…something — it is practically never exactly 3. Compare with >= (and remember that it already happened, with a bool).', 'timer перескакивает с 2.99… сразу на 3.00…что-то — ровно 3 почти никогда не бывает. Сравнивай через >= (и запомни через bool, что это уже случилось).'),
  },
  {
    id: 'int-division',
    level: 2,
    symptom: T('The health bar is always empty or full, never half.', 'Полоска здоровья всегда пустая или полная, никогда не наполовину.'),
    file: 'HealthBar.cs',
    code: `using UnityEngine;
using UnityEngine.UI;

public class HealthBar : MonoBehaviour
{
    public Slider slider;
    public int health = 50;
    public int maxHealth = 100;

    void Update()
    {
        slider.value = health / maxHealth; //!
    }
}`,
    fix: '        slider.value = (float)health / maxHealth;',
    hint: T('int / int …', 'int / int …'),
    why: T('Dividing two ints gives an int: 50 / 100 = 0 (the fraction is thrown away). Turn one into float first: (float)health / maxHealth = 0.5.', 'Деление двух int даёт int: 50 / 100 = 0 (дробная часть отбрасывается). Сначала преврати одно в float: (float)health / maxHealth = 0.5.'),
  },
  {
    id: 'spawn-every-frame',
    level: 2,
    symptom: T('Thousands of enemies appear and the game freezes.', 'Появляются тысячи врагов, игра зависает.'),
    file: 'Spawner.cs',
    code: `using UnityEngine;

public class Spawner : MonoBehaviour
{
    public GameObject enemyPrefab;

    void Update()
    {
        Instantiate(enemyPrefab, transform.position, Quaternion.identity); //!
    }
}`,
    fix: '        if (Input.GetKeyDown(KeyCode.E)) Instantiate(enemyPrefab, transform.position, Quaternion.identity);',
    hint: T('How often does Update run?', 'Как часто выполняется Update?'),
    why: T('Update runs ~60 times a second, so this creates 60 enemies per second. Spawn only on a condition: a key, a timer, or InvokeRepeating.', 'Update выполняется ~60 раз в секунду — это 60 врагов в секунду. Создавай только по условию: клавиша, таймер или InvokeRepeating.'),
  },
  {
    id: 'coroutine-direct',
    level: 3,
    symptom: T('The blinking coroutine does nothing at all.', 'Корутина мигания вообще ничего не делает.'),
    file: 'Blink.cs',
    code: `using System.Collections;
using UnityEngine;

public class Blink : MonoBehaviour
{
    void Start()
    {
        BlinkRoutine(); //!
    }

    IEnumerator BlinkRoutine()
    {
        GetComponent<SpriteRenderer>().enabled = false;
        yield return new WaitForSeconds(0.5f);
        GetComponent<SpriteRenderer>().enabled = true;
    }
}`,
    fix: '        StartCoroutine(BlinkRoutine());',
    hint: T('Coroutines are not called like normal methods.', 'Корутины не вызывают как обычные методы.'),
    why: T('Calling an IEnumerator method only creates the coroutine, it does not run it. StartCoroutine(…) runs it.', 'Вызов IEnumerator-метода только создаёт корутину, но не запускает её. Запускает StartCoroutine(…).'),
  },
  {
    id: 'clamp-ignored',
    level: 2,
    symptom: T('Health goes below 0 even though Mathf.Clamp is used.', 'Здоровье уходит ниже 0, хотя используется Mathf.Clamp.'),
    file: 'Health.cs',
    code: `using UnityEngine;

public class Health : MonoBehaviour
{
    public int health = 10;

    public void TakeDamage(int amount)
    {
        health -= amount;
        Mathf.Clamp(health, 0, 10); //!
    }
}`,
    fix: '        health = Mathf.Clamp(health, 0, 10);',
    hint: T('Where does the result go?', 'Куда попадает результат?'),
    why: T('Mathf.Clamp RETURNS the limited number; it does not change the variable. Put the result back: health = Mathf.Clamp(…).', 'Mathf.Clamp ВОЗВРАЩАЕТ ограниченное число, а переменную не меняет. Положи результат обратно: health = Mathf.Clamp(…).'),
  },
  {
    id: 'copy-not-saved',
    level: 3,
    symptom: T('The platform does not move up, no errors.', 'Платформа не поднимается, ошибок нет.'),
    file: 'Lift.cs',
    code: `using UnityEngine;

public class Lift : MonoBehaviour
{
    void Update()
    {
        Vector3 p = transform.position;
        p.y += 1f * Time.deltaTime; //!
    }
}`,
    fix: '        p.y += 1f * Time.deltaTime; transform.position = p;',
    hint: T('p is a copy.', 'p — это копия.'),
    why: T('Vector3 is copied by value. Changing p does not change the object — you must put it back: transform.position = p;', 'Vector3 копируется по значению. Изменение p не меняет объект — нужно положить обратно: transform.position = p;'),
  },
  {
    id: 'update-params',
    level: 2,
    symptom: T('Nothing in Update happens.', 'Ничего из Update не происходит.'),
    file: 'Spinner.cs',
    code: `using UnityEngine;

public class Spinner : MonoBehaviour
{
    void Update(float dt) //!
    {
        transform.Rotate(0, 0, 90 * dt);
    }
}`,
    fix: '    void Update()',
    hint: T('Unity messages have exact signatures.', 'У сообщений Unity точная «подпись».'),
    why: T('Unity calls Update() with no parameters. Update(float dt) is a different method that is never called. Use Time.deltaTime inside.', 'Unity вызывает Update() без параметров. Update(float dt) — другой метод, его никто не вызовет. Внутри используй Time.deltaTime.'),
  },
  {
    id: 'private-inspector',
    level: 1,
    symptom: T('The "speed" field does not appear in the Inspector.', 'Поле «speed» не появляется в Inspector.'),
    file: 'Car.cs',
    code: `using UnityEngine;

public class Car : MonoBehaviour
{
    float speed = 5f; //!

    void Update()
    {
        transform.Translate(speed * Time.deltaTime, 0, 0);
    }
}`,
    fix: '    [SerializeField] float speed = 5f;',
    hint: T('Without a word in front, a field is private.', 'Без слова перед ним поле — private.'),
    why: T('Fields are private by default and Unity hides private fields. Write public or [SerializeField] (better: keeps it private for other scripts).', 'Поля по умолчанию private, и Unity скрывает private-поля. Напиши public или [SerializeField] (лучше: для других скриптов останется private).'),
  },
  {
    id: 'file-name',
    level: 1,
    symptom: T('Cannot add the script to an object: "The script class cannot be found".', 'Скрипт нельзя повесить на объект: "The script class cannot be found".'),
    file: 'Player.cs',
    code: `using UnityEngine;

public class PlayerController : MonoBehaviour //!
{
    void Update()
    {
    }
}`,
    fix: 'public class Player : MonoBehaviour',
    hint: T('Look at the file name above the code.', 'Посмотри на имя файла над кодом.'),
    why: T('In Unity the class name must match the file name exactly: Player.cs → class Player (or rename the file to PlayerController.cs).', 'В Unity имя класса должно точно совпадать с именем файла: Player.cs → class Player (или переименуй файл в PlayerController.cs).'),
    lint: true,
  },
  {
    id: 'compare-tag-case',
    level: 1,
    symptom: T('Touching the enemy does nothing. The enemy has the tag "Enemy".', 'Касание врага ничего не делает. У врага тег «Enemy».'),
    file: 'Damage.cs',
    code: `using UnityEngine;

public class Damage : MonoBehaviour
{
    void OnTriggerEnter2D(Collider2D other)
    {
        if (other.CompareTag("enemy")) //!
        {
            Debug.Log("Ouch!");
        }
    }
}`,
    fix: '        if (other.CompareTag("Enemy"))',
    hint: T('Tags are text — exactly.', 'Теги — это текст, точный.'),
    why: T('Tags are compared exactly, letter case included: "enemy" ≠ "Enemy".', 'Теги сравниваются точно, с учётом больших букв: «enemy» ≠ «Enemy».'),
  },
];

/** The case with the marker removed, and the index of the wrong line. */
export function prepareBug(b: BugCase): { lines: string[]; answer: number } {
  const raw = b.code.split('\n');
  const answer = raw.findIndex((l) => l.includes('//!'));
  return { lines: raw.map((l) => l.replace(/\s*\/\/!\s*$/, '')), answer };
}

/** The code with the wrong line replaced by the fix. */
export function fixedCode(b: BugCase): string {
  const { lines, answer } = prepareBug(b);
  lines[answer] = b.fix;
  return lines.join('\n');
}
