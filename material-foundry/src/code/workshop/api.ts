// What can be typed after a dot, for the names a beginner meets in Unity and plain C#, plus
// short explanations. Used by the editor's suggestions ("transform." → position, Translate…).
// Snippets use CodeMirror's ${name} placeholders: Tab jumps to the next one.

import type { Text2 } from '../i18n';

export type ApiKind = 'method' | 'property' | 'constant' | 'class' | 'enum' | 'keyword' | 'function' | 'variable' | 'type';

export interface ApiItem {
  label: string;
  kind: ApiKind;
  /** Short type/signature shown next to the name. */
  detail?: string;
  info: Text2;
  /** Text inserted instead of the label (snippet syntax). */
  snippet?: string;
}

const I = (label: string, kind: ApiKind, detail: string, en: string, ru: string, snippet?: string): ApiItem => ({ label, kind, detail, info: { en, ru }, snippet });

const TRANSFORM: ApiItem[] = [
  I('position', 'property', 'Vector3', 'Where the object is in the world (x, y, z). You can read it or give it a new Vector3.', 'Где объект находится в мире (x, y, z). Можно прочитать или присвоить новый Vector3.'),
  I('localPosition', 'property', 'Vector3', 'Position relative to the parent object.', 'Положение относительно родительского объекта.'),
  I('rotation', 'property', 'Quaternion', 'How the object is turned (a Quaternion). Easier: use Rotate or eulerAngles.', 'Как объект повёрнут (Quaternion). Проще: Rotate или eulerAngles.'),
  I('eulerAngles', 'property', 'Vector3', 'Rotation in normal degrees (x, y, z).', 'Поворот в обычных градусах (x, y, z).'),
  I('localScale', 'property', 'Vector3', 'Size of the object. (1,1,1) is normal size, (2,2,2) is twice as big.', 'Размер объекта. (1,1,1) — обычный, (2,2,2) — в два раза больше.'),
  I('Translate', 'method', '(Vector3 move)', 'Moves the object by the given amount. Multiply by Time.deltaTime so speed does not depend on FPS.', 'Сдвигает объект на заданную величину. Умножай на Time.deltaTime, чтобы скорость не зависела от FPS.', 'Translate(${Vector3.right} * ${speed} * Time.deltaTime);'),
  I('Rotate', 'method', '(Vector3 angles)', 'Turns the object by the given degrees.', 'Поворачивает объект на заданные градусы.', 'Rotate(0, 0, ${90} * Time.deltaTime);'),
  I('LookAt', 'method', '(Transform target)', 'Turns the object to face the target.', 'Поворачивает объект лицом к цели.', 'LookAt(${target});'),
  I('forward', 'property', 'Vector3', 'The direction the object is facing (its blue Z arrow).', 'Направление, куда смотрит объект (синяя стрелка Z).'),
  I('right', 'property', 'Vector3', 'The object\'s own right direction (red X arrow).', 'Направление «вправо» самого объекта (красная стрелка X).'),
  I('up', 'property', 'Vector3', 'The object\'s own up direction (green Y arrow).', 'Направление «вверх» самого объекта (зелёная стрелка Y).'),
  I('parent', 'property', 'Transform', 'The object this one is attached to (in the Hierarchy).', 'Объект, к которому этот прикреплён (в Hierarchy).'),
  I('SetParent', 'method', '(Transform parent)', 'Attaches this object to another one.', 'Прикрепляет этот объект к другому.', 'SetParent(${parent});'),
  I('childCount', 'property', 'int', 'How many child objects it has.', 'Сколько у него дочерних объектов.'),
  I('GetChild', 'method', '(int index)', 'Gets a child object by its number (from 0).', 'Берёт дочерний объект по номеру (с 0).', 'GetChild(${0})'),
  I('Find', 'method', '(string name)', 'Finds a child by name. Do it once in Start, not every frame.', 'Ищет дочерний объект по имени. Делай один раз в Start, а не каждый кадр.', 'Find("${Name}")'),
];

const GAMEOBJECT: ApiItem[] = [
  I('SetActive', 'method', '(bool value)', 'Turns the object on (true) or off (false). Turned-off objects are invisible and their scripts stop.', 'Включает (true) или выключает (false) объект. Выключенный объект не видно, его скрипты не работают.', 'SetActive(${false});'),
  I('activeSelf', 'property', 'bool', 'Is the object turned on?', 'Включён ли объект?'),
  I('name', 'property', 'string', 'The object\'s name from the Hierarchy.', 'Имя объекта из Hierarchy.'),
  I('tag', 'property', 'string', 'The object\'s tag (Player, Enemy…). Compare with CompareTag.', 'Тег объекта (Player, Enemy…). Сравнивай через CompareTag.'),
  I('CompareTag', 'method', '(string tag)', 'True if the object has this tag. Faster and safer than tag == "...".', 'true, если у объекта этот тег. Быстрее и надёжнее, чем tag == "...".', 'CompareTag("${Player}")'),
  I('GetComponent', 'method', '<T>()', 'Finds another component on the same object (Rigidbody2D, Animator…). Do it once in Start/Awake and keep it in a variable.', 'Находит другой компонент на этом же объекте (Rigidbody2D, Animator…). Делай один раз в Start/Awake и храни в переменной.', 'GetComponent<${Rigidbody2D}>()'),
  I('AddComponent', 'method', '<T>()', 'Adds a new component to the object while the game runs.', 'Добавляет новый компонент объекту во время игры.', 'AddComponent<${Rigidbody2D}>()'),
  I('transform', 'property', 'Transform', 'Position, rotation and size of this object.', 'Положение, поворот и размер этого объекта.'),
  I('layer', 'property', 'int', 'The object\'s layer number (used by physics and cameras).', 'Номер слоя объекта (для физики и камер).'),
];

const MONO: ApiItem[] = [
  I('transform', 'property', 'Transform', 'Position, rotation and size of the object this script is on.', 'Положение, поворот и размер объекта, на котором висит этот скрипт.'),
  I('gameObject', 'property', 'GameObject', 'The object this script is on.', 'Объект, на котором висит этот скрипт.'),
  I('GetComponent', 'method', '<T>()', 'Finds another component on the same object. Do it once in Start/Awake.', 'Находит другой компонент на этом же объекте. Делай один раз в Start/Awake.', 'GetComponent<${Rigidbody2D}>()'),
  I('enabled', 'property', 'bool', 'Is this script turned on? When false, Update stops being called.', 'Включён ли этот скрипт? Если false, Update перестаёт вызываться.'),
  I('StartCoroutine', 'method', '(IEnumerator routine)', 'Starts a coroutine: a method that can wait (yield return new WaitForSeconds(1)).', 'Запускает корутину — метод, который умеет ждать (yield return new WaitForSeconds(1)).', 'StartCoroutine(${Routine}());'),
  I('StopAllCoroutines', 'method', '()', 'Stops all coroutines of this script.', 'Останавливает все корутины этого скрипта.', 'StopAllCoroutines();'),
  I('Invoke', 'method', '(string method, float delay)', 'Calls a method of this script after some seconds.', 'Вызывает метод этого скрипта через несколько секунд.', 'Invoke("${MethodName}", ${2f});'),
  I('Destroy', 'function', '(Object obj, float delay = 0)', 'Removes an object (or component) from the game. Optional delay in seconds.', 'Удаляет объект (или компонент) из игры. Можно указать задержку в секундах.', 'Destroy(${gameObject});'),
  I('Instantiate', 'function', '(Object prefab, Vector3 pos, Quaternion rot)', 'Creates a copy of a prefab in the scene.', 'Создаёт копию префаба в сцене.', 'Instantiate(${prefab}, ${transform.position}, ${Quaternion.identity});'),
];

const RIGIDBODY2D: ApiItem[] = [
  I('linearVelocity', 'property', 'Vector2', 'Speed and direction of movement (Unity 6). In older Unity it is called velocity.', 'Скорость и направление движения (Unity 6). В старых версиях Unity — velocity.'),
  I('velocity', 'property', 'Vector2', 'Speed and direction of movement (Unity 2022 and older; in Unity 6 use linearVelocity).', 'Скорость и направление движения (Unity 2022 и старше; в Unity 6 — linearVelocity).'),
  I('AddForce', 'method', '(Vector2 force, ForceMode2D mode)', 'Pushes the body. ForceMode2D.Impulse = a sharp push (good for a jump).', 'Толкает тело. ForceMode2D.Impulse — резкий толчок (хорошо для прыжка).', 'AddForce(Vector2.up * ${jumpForce}, ForceMode2D.Impulse);'),
  I('gravityScale', 'property', 'float', 'How strongly gravity pulls this body. 0 = no gravity.', 'Насколько сильно тянет гравитация. 0 — без гравитации.'),
  I('mass', 'property', 'float', 'How heavy the body is.', 'Насколько тело тяжёлое.'),
  I('MovePosition', 'method', '(Vector2 position)', 'Moves the body with physics (call in FixedUpdate).', 'Двигает тело с учётом физики (вызывай в FixedUpdate).', 'MovePosition(rb.position + ${move} * Time.fixedDeltaTime);'),
  I('position', 'property', 'Vector2', 'Position of the body.', 'Положение тела.'),
  I('bodyType', 'property', 'RigidbodyType2D', 'Dynamic (physics moves it), Kinematic (you move it), Static (does not move).', 'Dynamic (двигает физика), Kinematic (двигаешь ты), Static (не двигается).'),
  I('freezeRotation', 'property', 'bool', 'true = the body never tips over.', 'true — тело никогда не опрокидывается.'),
];

const RIGIDBODY: ApiItem[] = [
  I('linearVelocity', 'property', 'Vector3', 'Speed and direction of movement (Unity 6; older: velocity).', 'Скорость и направление (Unity 6; в старых — velocity).'),
  I('velocity', 'property', 'Vector3', 'Speed and direction (older Unity).', 'Скорость и направление (старые версии Unity).'),
  I('AddForce', 'method', '(Vector3 force, ForceMode mode)', 'Pushes the body. ForceMode.Impulse = a sharp push.', 'Толкает тело. ForceMode.Impulse — резкий толчок.', 'AddForce(Vector3.up * ${jumpForce}, ForceMode.Impulse);'),
  I('useGravity', 'property', 'bool', 'Does gravity pull the body?', 'Действует ли гравитация на тело?'),
  I('isKinematic', 'property', 'bool', 'true = physics does not move it, only your code.', 'true — физика его не двигает, только твой код.'),
  I('MovePosition', 'method', '(Vector3 position)', 'Moves the body with physics (in FixedUpdate).', 'Двигает тело с учётом физики (в FixedUpdate).', 'MovePosition(rb.position + ${move} * Time.fixedDeltaTime);'),
];

const STATICS: Record<string, ApiItem[]> = {
  Input: [
    I('GetKey', 'method', '(KeyCode key)', 'True every frame while the key is held.', 'true каждый кадр, пока клавиша зажата.', 'GetKey(KeyCode.${Space})'),
    I('GetKeyDown', 'method', '(KeyCode key)', 'True only in the one frame when the key is pressed. Use for jump and shoot.', 'true только в тот кадр, когда клавишу нажали. Для прыжка и выстрела.', 'GetKeyDown(KeyCode.${Space})'),
    I('GetKeyUp', 'method', '(KeyCode key)', 'True in the frame when the key is released.', 'true в кадр, когда клавишу отпустили.', 'GetKeyUp(KeyCode.${Space})'),
    I('GetAxis', 'method', '(string axis)', 'Smooth value from -1 to 1 for arrows/WASD/joystick. "Horizontal" or "Vertical".', 'Плавное значение от -1 до 1 для стрелок/WASD/джойстика. "Horizontal" или "Vertical".', 'GetAxis("${Horizontal}")'),
    I('GetAxisRaw', 'method', '(string axis)', 'Like GetAxis but without smoothing: exactly -1, 0 or 1.', 'Как GetAxis, но без сглаживания: ровно -1, 0 или 1.', 'GetAxisRaw("${Horizontal}")'),
    I('GetMouseButtonDown', 'method', '(int button)', 'True in the frame a mouse button is pressed. 0 = left, 1 = right.', 'true в кадр нажатия кнопки мыши. 0 — левая, 1 — правая.', 'GetMouseButtonDown(${0})'),
    I('GetMouseButton', 'method', '(int button)', 'True while a mouse button is held.', 'true, пока кнопка мыши зажата.', 'GetMouseButton(${0})'),
    I('mousePosition', 'property', 'Vector3', 'Mouse position on the screen in pixels.', 'Положение мыши на экране в пикселях.'),
    I('anyKeyDown', 'property', 'bool', 'True in the frame any key is pressed.', 'true в кадр, когда нажата любая клавиша.'),
  ],
  Time: [
    I('deltaTime', 'property', 'float', 'Seconds since the last frame (about 0.016 at 60 FPS). Multiply speeds by it so the game runs the same on every computer.', 'Секунды с прошлого кадра (около 0.016 при 60 FPS). Умножай скорости на него, чтобы игра шла одинаково на любом компьютере.'),
    I('time', 'property', 'float', 'Seconds since the game started.', 'Секунды с начала игры.'),
    I('fixedDeltaTime', 'property', 'float', 'Time step of physics (FixedUpdate), usually 0.02.', 'Шаг времени физики (FixedUpdate), обычно 0.02.'),
    I('timeScale', 'property', 'float', 'Game speed. 0 = pause, 1 = normal, 0.5 = slow motion.', 'Скорость игры. 0 — пауза, 1 — обычная, 0.5 — замедление.'),
    I('unscaledDeltaTime', 'property', 'float', 'deltaTime that ignores pause (timeScale). Good for menus.', 'deltaTime без учёта паузы (timeScale). Удобно для меню.'),
  ],
  Debug: [
    I('Log', 'method', '(object message)', 'Writes a message to the Unity Console. Your best friend for finding mistakes.', 'Пишет сообщение в Console Unity. Лучший друг в поиске ошибок.', 'Log("${message}");'),
    I('LogWarning', 'method', '(object message)', 'A yellow warning in the Console.', 'Жёлтое предупреждение в Console.', 'LogWarning("${message}");'),
    I('LogError', 'method', '(object message)', 'A red error in the Console.', 'Красная ошибка в Console.', 'LogError("${message}");'),
    I('DrawRay', 'method', '(Vector3 start, Vector3 dir, Color color)', 'Draws a line in the Scene view (for checking raycasts).', 'Рисует линию в окне Scene (для проверки лучей).', 'DrawRay(transform.position, ${Vector3.down}, Color.${red});'),
  ],
  Mathf: [
    I('Clamp', 'method', '(float v, float min, float max)', 'Keeps a value between min and max (health from 0 to 100).', 'Держит значение между min и max (здоровье от 0 до 100).', 'Clamp(${value}, ${0}, ${100})'),
    I('Abs', 'method', '(float v)', 'Value without the minus sign.', 'Значение без знака минус.', 'Abs(${value})'),
    I('Max', 'method', '(float a, float b)', 'The bigger of two.', 'Большее из двух.', 'Max(${a}, ${b})'),
    I('Min', 'method', '(float a, float b)', 'The smaller of two.', 'Меньшее из двух.', 'Min(${a}, ${b})'),
    I('Lerp', 'method', '(float a, float b, float t)', 'Value between a and b. t = 0 → a, t = 1 → b. For smooth changes.', 'Значение между a и b. t = 0 → a, t = 1 → b. Для плавных изменений.', 'Lerp(${a}, ${b}, ${t})'),
    I('Sin', 'method', '(float angle)', 'Wave from -1 to 1. Sin(Time.time) makes things swing.', 'Волна от -1 до 1. Sin(Time.time) — для покачиваний.', 'Sin(Time.time * ${2f})'),
    I('Round', 'method', '(float v)', 'Rounds to a whole number.', 'Округляет до целого.', 'Round(${value})'),
    I('RoundToInt', 'method', '(float v)', 'Rounds and gives an int.', 'Округляет и даёт int.', 'RoundToInt(${value})'),
    I('PI', 'constant', 'float', 'The number π ≈ 3.14159.', 'Число π ≈ 3.14159.'),
    I('Sqrt', 'method', '(float v)', 'Square root.', 'Квадратный корень.', 'Sqrt(${value})'),
    I('MoveTowards', 'method', '(float current, float target, float step)', 'Moves a number towards a target by at most step.', 'Приближает число к цели не больше чем на step.', 'MoveTowards(${current}, ${target}, ${speed} * Time.deltaTime)'),
  ],
  Vector3: [
    I('zero', 'constant', '(0,0,0)', 'No movement / the centre of the world.', 'Без движения / центр мира.'),
    I('one', 'constant', '(1,1,1)', 'All ones (normal scale).', 'Все единицы (обычный размер).'),
    I('up', 'constant', '(0,1,0)', 'Up.', 'Вверх.'),
    I('down', 'constant', '(0,-1,0)', 'Down.', 'Вниз.'),
    I('left', 'constant', '(-1,0,0)', 'Left.', 'Влево.'),
    I('right', 'constant', '(1,0,0)', 'Right.', 'Вправо.'),
    I('forward', 'constant', '(0,0,1)', 'Forward (into the screen).', 'Вперёд (вглубь экрана).'),
    I('back', 'constant', '(0,0,-1)', 'Back.', 'Назад.'),
    I('Distance', 'method', '(Vector3 a, Vector3 b)', 'Distance between two points.', 'Расстояние между двумя точками.', 'Distance(${transform.position}, ${target.position})'),
    I('Lerp', 'method', '(Vector3 a, Vector3 b, float t)', 'Point between a and b (for smooth movement).', 'Точка между a и b (для плавного движения).', 'Lerp(${a}, ${b}, ${t})'),
    I('MoveTowards', 'method', '(Vector3 current, Vector3 target, float step)', 'Moves a point towards the target by at most step. Great for enemies.', 'Двигает точку к цели не больше чем на step. Отлично для врагов.', 'MoveTowards(transform.position, ${target.position}, ${speed} * Time.deltaTime)'),
    I('Normalize', 'method', '(Vector3 v)', 'Same direction, length 1.', 'То же направление, длина 1.', 'Normalize(${v})'),
  ],
  Vector2: [
    I('zero', 'constant', '(0,0)', 'No movement.', 'Без движения.'),
    I('one', 'constant', '(1,1)', 'All ones.', 'Все единицы.'),
    I('up', 'constant', '(0,1)', 'Up.', 'Вверх.'),
    I('down', 'constant', '(0,-1)', 'Down.', 'Вниз.'),
    I('left', 'constant', '(-1,0)', 'Left.', 'Влево.'),
    I('right', 'constant', '(1,0)', 'Right.', 'Вправо.'),
    I('Distance', 'method', '(Vector2 a, Vector2 b)', 'Distance between two points.', 'Расстояние между двумя точками.', 'Distance(${a}, ${b})'),
    I('MoveTowards', 'method', '(Vector2 current, Vector2 target, float step)', 'Moves a point towards the target.', 'Двигает точку к цели.', 'MoveTowards(${current}, ${target}, ${speed} * Time.deltaTime)'),
  ],
  Quaternion: [
    I('identity', 'constant', 'Quaternion', 'No rotation. Use when creating objects with Instantiate.', 'Без поворота. Используй при создании объектов через Instantiate.'),
    I('Euler', 'method', '(float x, float y, float z)', 'Rotation from normal degrees.', 'Поворот из обычных градусов.', 'Euler(0, 0, ${90})'),
    I('LookRotation', 'method', '(Vector3 forward)', 'Rotation that looks in a direction.', 'Поворот, смотрящий в направлении.', 'LookRotation(${direction})'),
  ],
  KeyCode: ['Space', 'LeftArrow', 'RightArrow', 'UpArrow', 'DownArrow', 'W', 'A', 'S', 'D', 'E', 'F', 'R', 'Q', 'Escape', 'Return', 'LeftShift', 'Mouse0', 'Alpha1', 'Alpha2', 'Tab'].map((k) =>
    I(k, 'enum', 'KeyCode', `The ${k} key.`, `Клавиша ${k}.`),
  ),
  ForceMode2D: [I('Impulse', 'enum', 'ForceMode2D', 'A sharp push at once (jump, explosion).', 'Резкий толчок сразу (прыжок, взрыв).'), I('Force', 'enum', 'ForceMode2D', 'A gentle push over time (engine, wind).', 'Мягкое постоянное давление (двигатель, ветер).')],
  ForceMode: [I('Impulse', 'enum', 'ForceMode', 'A sharp push at once.', 'Резкий толчок сразу.'), I('Force', 'enum', 'ForceMode', 'A gentle push over time.', 'Мягкое постоянное давление.'), I('VelocityChange', 'enum', 'ForceMode', 'Changes speed directly, ignoring mass.', 'Меняет скорость напрямую, без учёта массы.')],
  Color: ['red', 'green', 'blue', 'white', 'black', 'yellow', 'cyan', 'magenta', 'gray', 'clear'].map((c) => I(c, 'constant', 'Color', `The colour ${c}.`, `Цвет ${c}.`)),
  SceneManager: [
    I('LoadScene', 'method', '(string name)', 'Opens another scene (level). Needs "using UnityEngine.SceneManagement;" and the scene in Build Settings.', 'Открывает другую сцену (уровень). Нужно «using UnityEngine.SceneManagement;» и сцена в Build Settings.', 'LoadScene("${Level2}");'),
    I('GetActiveScene', 'method', '()', 'The scene that is open now. GetActiveScene().buildIndex — its number.', 'Сцена, открытая сейчас. GetActiveScene().buildIndex — её номер.', 'GetActiveScene()'),
  ],
  PlayerPrefs: [
    I('SetInt', 'method', '(string key, int value)', 'Saves a whole number on the computer (stays after the game is closed).', 'Сохраняет целое число на компьютере (останется после закрытия игры).', 'SetInt("${best}", ${score});'),
    I('GetInt', 'method', '(string key, int default)', 'Reads a saved whole number.', 'Читает сохранённое целое число.', 'GetInt("${best}", ${0})'),
    I('SetFloat', 'method', '(string key, float value)', 'Saves a fractional number.', 'Сохраняет дробное число.', 'SetFloat("${volume}", ${value});'),
    I('GetFloat', 'method', '(string key, float default)', 'Reads a saved fractional number.', 'Читает сохранённое дробное число.', 'GetFloat("${volume}", ${1f})'),
    I('SetString', 'method', '(string key, string value)', 'Saves text.', 'Сохраняет текст.', 'SetString("${name}", ${value});'),
    I('GetString', 'method', '(string key, string default)', 'Reads saved text.', 'Читает сохранённый текст.', 'GetString("${name}", "")'),
    I('Save', 'method', '()', 'Writes everything to disk now.', 'Записывает всё на диск прямо сейчас.', 'Save();'),
  ],
  Physics: [
    I('Raycast', 'method', '(Vector3 origin, Vector3 dir, out RaycastHit hit, float distance)', 'Shoots an invisible ray. true = it hit something; "hit" then tells what, where and how far. This is how shots work in shooters.', 'Пускает невидимый луч. true — во что-то попал; тогда «hit» скажет, во что, где и как далеко. Так устроены выстрелы в шутерах.', 'Raycast(${cam.position}, ${cam.forward}, out RaycastHit hit, ${100f})'),
    I('gravity', 'property', 'Vector3', 'The gravity of the world (0, -9.81, 0).', 'Гравитация мира (0, -9.81, 0).'),
  ],
  Cursor: [
    I('lockState', 'property', 'CursorLockMode', 'Locked = the cursor is hidden and stays in the centre (first-person view).', 'Locked — курсор спрятан и держится в центре (вид от первого лица).', 'lockState = CursorLockMode.Locked;'),
    I('visible', 'property', 'bool', 'Show or hide the mouse cursor.', 'Показать или спрятать курсор мыши.'),
  ],
  CursorLockMode: [I('Locked', 'enum', 'CursorLockMode', 'Cursor hidden and locked in the centre.', 'Курсор спрятан и закреплён в центре.'), I('None', 'enum', 'CursorLockMode', 'Normal free cursor.', 'Обычный свободный курсор.'), I('Confined', 'enum', 'CursorLockMode', 'The cursor cannot leave the window.', 'Курсор не выходит за окно.')],
  Physics2D: [
    I('Raycast', 'method', '(Vector2 origin, Vector2 dir, float distance)', 'Shoots an invisible ray and tells what it hits. Used for "am I on the ground?".', 'Пускает невидимый луч и говорит, во что он попал. Используется для «стою ли я на земле?».', 'Raycast(transform.position, Vector2.down, ${1.1f})'),
    I('OverlapCircle', 'method', '(Vector2 point, float radius, int layerMask)', 'Is there any collider inside this circle?', 'Есть ли какой-то коллайдер в этом круге?', 'OverlapCircle(${groundCheck.position}, ${0.2f}, ${groundLayer})'),
  ],
  Random: [
    I('Range', 'method', '(min, max)', 'A random number. For int, max is NOT included: Random.Range(0, 3) gives 0, 1 or 2.', 'Случайное число. Для int max НЕ входит: Random.Range(0, 3) даёт 0, 1 или 2.', 'Range(${0}, ${10})'),
    I('value', 'property', 'float', 'A random number from 0 to 1.', 'Случайное число от 0 до 1.'),
  ],
  Console: [
    I('WriteLine', 'method', '(object value)', 'Prints text and moves to a new line.', 'Выводит текст и переходит на новую строку.', 'WriteLine(${"Hello"});'),
    I('Write', 'method', '(object value)', 'Prints text without a new line.', 'Выводит текст без перехода на новую строку.', 'Write(${"text"});'),
    I('ReadLine', 'method', '()', 'Waits until the person types a line and presses Enter, then gives the text.', 'Ждёт, пока человек напишет строку и нажмёт Enter, и даёт этот текст.', 'ReadLine()'),
    I('Clear', 'method', '()', 'Clears the console window.', 'Очищает окно консоли.', 'Clear();'),
  ],
  Math: [
    I('Max', 'method', '(a, b)', 'The bigger of two.', 'Большее из двух.', 'Max(${a}, ${b})'),
    I('Min', 'method', '(a, b)', 'The smaller of two.', 'Меньшее из двух.', 'Min(${a}, ${b})'),
    I('Abs', 'method', '(x)', 'Without the minus sign.', 'Без знака минус.', 'Abs(${x})'),
    I('Round', 'method', '(x)', 'Rounds.', 'Округляет.', 'Round(${x})'),
    I('Sqrt', 'method', '(x)', 'Square root.', 'Квадратный корень.', 'Sqrt(${x})'),
    I('Pow', 'method', '(x, y)', 'x to the power y.', 'x в степени y.', 'Pow(${x}, ${2})'),
    I('PI', 'constant', 'double', 'π ≈ 3.14159.', 'π ≈ 3.14159.'),
  ],
  string: [
    I('Join', 'method', '(string sep, list)', 'Glues the items of a list into one text.', 'Склеивает элементы списка в один текст.', 'Join(", ", ${items})'),
    I('IsNullOrEmpty', 'method', '(string s)', 'True if the text is null or "".', 'true, если текст null или "".', 'IsNullOrEmpty(${text})'),
  ],
  int: [I('Parse', 'method', '(string s)', 'Turns text into a whole number ("42" → 42). Crashes on wrong text — TryParse is safer.', 'Превращает текст в целое число ("42" → 42). Падает на неверном тексте — TryParse надёжнее.', 'Parse(${text})'), I('MaxValue', 'constant', 'int', 'The biggest int: 2 147 483 647.', 'Самый большой int: 2 147 483 647.')],
  float: [I('Parse', 'method', '(string s)', 'Turns text into a fractional number.', 'Превращает текст в дробное число.', 'Parse(${text})')],
};

const COLLIDER: ApiItem[] = [
  I('gameObject', 'property', 'GameObject', 'The object we touched.', 'Объект, которого мы коснулись.'),
  I('CompareTag', 'method', '(string tag)', 'Does the touched object have this tag?', 'Есть ли у объекта, которого коснулись, этот тег?', 'CompareTag("${Coin}")'),
  I('transform', 'property', 'Transform', 'Position of the touched object.', 'Положение объекта, которого коснулись.'),
  I('name', 'property', 'string', 'Name of the touched object.', 'Имя объекта, которого коснулись.'),
  I('GetComponent', 'method', '<T>()', 'A component of the touched object.', 'Компонент объекта, которого коснулись.', 'GetComponent<${Enemy}>()'),
];

const LIST: ApiItem[] = [
  I('Add', 'method', '(T item)', 'Puts an item at the end of the list.', 'Кладёт элемент в конец списка.', 'Add(${item});'),
  I('Remove', 'method', '(T item)', 'Removes the first such item.', 'Убирает первый такой элемент.', 'Remove(${item});'),
  I('RemoveAt', 'method', '(int index)', 'Removes the item at this number.', 'Убирает элемент с этим номером.', 'RemoveAt(${0});'),
  I('Count', 'property', 'int', 'How many items are in the list.', 'Сколько элементов в списке.'),
  I('Contains', 'method', '(T item)', 'Is this item in the list?', 'Есть ли этот элемент в списке?', 'Contains(${item})'),
  I('Clear', 'method', '()', 'Removes everything.', 'Убирает всё.', 'Clear();'),
  I('IndexOf', 'method', '(T item)', 'Number of the item, or -1.', 'Номер элемента или -1.', 'IndexOf(${item})'),
  I('Insert', 'method', '(int index, T item)', 'Puts an item at a position.', 'Вставляет элемент на место.', 'Insert(${0}, ${item});'),
  I('Sort', 'method', '()', 'Sorts the list.', 'Сортирует список.', 'Sort();'),
  I('Where', 'method', '(x => condition)', 'LINQ: only the items that fit the condition.', 'LINQ: только элементы, подходящие под условие.', 'Where(x => ${x > 0})'),
  I('Select', 'method', '(x => value)', 'LINQ: turns every item into something else.', 'LINQ: превращает каждый элемент во что-то другое.', 'Select(x => ${x * 2})'),
  I('Sum', 'method', '()', 'LINQ: the sum of all numbers.', 'LINQ: сумма всех чисел.', 'Sum()'),
  I('Max', 'method', '()', 'LINQ: the biggest item.', 'LINQ: самый большой элемент.', 'Max()'),
  I('Average', 'method', '()', 'LINQ: the average.', 'LINQ: среднее.', 'Average()'),
  I('ToList', 'method', '()', 'LINQ: makes a new list.', 'LINQ: делает новый список.', 'ToList()'),
  I('First', 'method', '()', 'LINQ: the first item.', 'LINQ: первый элемент.', 'First()'),
  I('Any', 'method', '(x => condition)', 'LINQ: is there at least one such item?', 'LINQ: есть ли хоть один такой элемент?', 'Any(x => ${condition})'),
];

const DICT: ApiItem[] = [
  I('Add', 'method', '(key, value)', 'Adds a key with a value.', 'Добавляет ключ со значением.', 'Add(${"key"}, ${value});'),
  I('ContainsKey', 'method', '(key)', 'Is there such a key?', 'Есть ли такой ключ?', 'ContainsKey(${"key"})'),
  I('TryGetValue', 'method', '(key, out value)', 'Reads the value safely: gives false when there is no key.', 'Безопасно читает значение: даёт false, если ключа нет.', 'TryGetValue(${"key"}, out var ${value})'),
  I('Remove', 'method', '(key)', 'Removes the key.', 'Удаляет ключ.', 'Remove(${"key"});'),
  I('Count', 'property', 'int', 'How many keys.', 'Сколько ключей.'),
  I('Keys', 'property', 'collection', 'All keys.', 'Все ключи.'),
  I('Values', 'property', 'collection', 'All values.', 'Все значения.'),
];

const STRING_MEMBERS: ApiItem[] = [
  I('Length', 'property', 'int', 'How many characters.', 'Сколько символов.'),
  I('ToUpper', 'method', '()', 'BIG LETTERS.', 'БОЛЬШИЕ БУКВЫ.', 'ToUpper()'),
  I('ToLower', 'method', '()', 'small letters.', 'маленькие буквы.', 'ToLower()'),
  I('Contains', 'method', '(string part)', 'Is this piece inside?', 'Есть ли внутри этот кусок?', 'Contains("${part}")'),
  I('Replace', 'method', '(string a, string b)', 'Replaces every a with b.', 'Заменяет каждое a на b.', 'Replace("${a}", "${b}")'),
  I('Split', 'method', '(char sep)', 'Cuts the text into pieces.', 'Режет текст на части.', "Split('${ }')"),
  I('Trim', 'method', '()', 'Removes spaces at the edges.', 'Убирает пробелы по краям.', 'Trim()'),
  I('Substring', 'method', '(int start, int length)', 'A piece of the text.', 'Кусок текста.', 'Substring(${0}, ${3})'),
  I('StartsWith', 'method', '(string s)', 'Does it start with s?', 'Начинается ли с s?', 'StartsWith("${s}")'),
];

const VECTOR_MEMBERS: ApiItem[] = [
  I('x', 'property', 'float', 'Left–right part.', 'Часть «влево–вправо».'),
  I('y', 'property', 'float', 'Down–up part.', 'Часть «вниз–вверх».'),
  I('z', 'property', 'float', 'Near–far part (3D).', 'Часть «ближе–дальше» (3D).'),
  I('normalized', 'property', 'Vector', 'Same direction, length 1. Diagonal movement is then not faster.', 'То же направление, длина 1. Тогда по диагонали не быстрее.'),
  I('magnitude', 'property', 'float', 'Length of the vector (for velocity: the speed).', 'Длина вектора (для скорости — сама скорость).'),
];

const CHARACTER_CONTROLLER: ApiItem[] = [
  I('Move', 'method', '(Vector3 motion)', 'Moves the body by this much, with collisions: walls stop it, small steps are climbed. Multiply by Time.deltaTime.', 'Двигает тело на столько, со столкновениями: стены держат, ступеньки преодолеваются. Умножай на Time.deltaTime.', 'Move(${move} * ${speed} * Time.deltaTime);'),
  I('isGrounded', 'property', 'bool', 'true when the body stands on something (after the last Move).', 'true, когда тело на чём-то стоит (после последнего Move).'),
  I('height', 'property', 'float', 'The height of the body: 1.8 standing, about 1 crouched.', 'Рост тела: 1.8 стоя, около 1 пригнувшись.'),
  I('radius', 'property', 'float', 'How wide the body is.', 'Насколько тело широкое.'),
  I('velocity', 'property', 'Vector3', 'How fast the body moved during the last frame.', 'Как быстро тело двигалось за последний кадр.'),
  I('SimpleMove', 'method', '(Vector3 speed)', 'Moves with gravity added automatically (no jumping).', 'Двигает и сам добавляет гравитацию (без прыжков).', 'SimpleMove(${move} * ${speed});'),
];
const RAYCAST_HIT: ApiItem[] = [
  I('collider', 'property', 'Collider', 'What the ray hit. hit.collider.GetComponent<…>() takes a part of it.', 'Во что попал луч. hit.collider.GetComponent<…>() — взять у него деталь.'),
  I('point', 'property', 'Vector3', 'The exact point of the hit (for sparks and holes).', 'Точная точка попадания (для искр и дырок).'),
  I('normal', 'property', 'Vector3', 'Which way the hit surface faces.', 'Куда смотрит поверхность в месте попадания.'),
  I('distance', 'property', 'float', 'How far the hit is.', 'Как далеко попадание.'),
  I('transform', 'property', 'Transform', 'The Transform of what was hit.', 'Transform того, во что попали.'),
];
const CAMERA: ApiItem[] = [
  I('fieldOfView', 'property', 'float', 'How wide the camera sees (degrees). Wider when sprinting feels fast.', 'Насколько широко видит камера (градусы). Шире на бегу — ощущение скорости.'),
  I('transform', 'property', 'Transform', 'The position and rotation of the camera.', 'Положение и поворот камеры.'),
  I('ScreenPointToRay', 'method', '(Vector3 screenPoint)', 'A ray from the camera through a point of the screen.', 'Луч из камеры через точку экрана.', 'ScreenPointToRay(Input.mousePosition)'),
];
const HEALTH: ApiItem[] = [
  I('TakeDamage', 'method', '(int amount)', 'Take away health (the Health part of targets and bots in the Shooter).', 'Отнять здоровье (деталь Health мишеней и ботов в Шутере).', 'TakeDamage(${damage});'),
  I('Heal', 'method', '(int amount)', 'Give health back.', 'Вернуть здоровье.', 'Heal(${10});'),
  I('currentHealth', 'property', 'int', 'How much health is left.', 'Сколько здоровья осталось.'),
  I('maxHealth', 'property', 'int', 'Full health.', 'Полное здоровье.'),
];

/** Types of well-known variables, so "rb." or "other." suggest the right members. */
const TYPE_MEMBERS: Record<string, ApiItem[]> = {
  Transform: TRANSFORM,
  GameObject: GAMEOBJECT,
  Rigidbody2D: RIGIDBODY2D,
  Rigidbody: RIGIDBODY,
  Collider2D: COLLIDER,
  Collider: COLLIDER,
  Collision2D: [...COLLIDER, I('contacts', 'property', 'ContactPoint2D[]', 'Points where the objects touch.', 'Точки, где объекты касаются.')],
  Collision: COLLIDER,
  List: LIST,
  Dictionary: DICT,
  string: STRING_MEMBERS,
  Vector2: VECTOR_MEMBERS,
  Vector3: VECTOR_MEMBERS,
  CharacterController: CHARACTER_CONTROLLER,
  RaycastHit: RAYCAST_HIT,
  Camera: CAMERA,
  Health: HEALTH,
};

/** Members for "<receiver>." in C#, using variable declarations found in the text. */
export function csMembers(receiver: string, doc: string): ApiItem[] {
  if (STATICS[receiver]) return STATICS[receiver];
  if (receiver === 'transform') return TRANSFORM;
  if (receiver === 'gameObject') return GAMEOBJECT;
  if (receiver === 'this' || receiver === 'base') return MONO;
  if (/\.(transform|parent)$/.test(receiver) || /\.GetChild\(.*\)$/.test(receiver)) return TRANSFORM;
  if (/\.(position|localPosition|velocity|linearVelocity|localScale|eulerAngles|up|right|forward)$/.test(receiver)) return VECTOR_MEMBERS;
  if (/\.gameObject$/.test(receiver)) return GAMEOBJECT;
  const name = receiver.split('.').pop()!;
  const type = declaredType(name, doc);
  if (type) {
    const base = type.replace(/<.*$/, '').replace(/\[\]$/, '');
    if (TYPE_MEMBERS[base]) return TYPE_MEMBERS[base];
    if (/\[\]$/.test(type)) return [I('Length', 'property', 'int', 'How many items the array has.', 'Сколько элементов в массиве.')];
  }
  // Common names when the type is not visible.
  if (/^(rb|body|rigidbody|rb2d)$/i.test(name)) return /Rigidbody\b(?!2D)/.test(doc) && !/Rigidbody2D/.test(doc) ? RIGIDBODY : RIGIDBODY2D;
  if (/^hit$/i.test(name) && /RaycastHit/.test(doc)) return RAYCAST_HIT;
  if (/^(controller|cc|characterController)$/i.test(name)) return CHARACTER_CONTROLLER;
  if (/^(other|col|collider|collision|hit)$/i.test(name)) return COLLIDER;
  return [];
}

/** Finds "Type name" / "Type name =" in the text. */
export function declaredType(name: string, doc: string): string | null {
  const re = new RegExp(`([A-Za-z_][\\w.]*(?:<[^<>;()]*>)?(?:\\[\\])?)\\s+${name.replace(/[^\w]/g, '')}\\s*(?:[=;,)]|$)`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const t = m[1];
    if (['return', 'new', 'in', 'out', 'ref', 'is', 'as', 'else', 'case'].includes(t)) continue;
    if (t === 'var') {
      const init = new RegExp(`var\\s+${name}\\s*=\\s*(?:new\\s+)?([A-Z]\\w*(?:<[^<>;()]*>)?)`).exec(doc);
      if (init) return init[1];
      continue;
    }
    return t;
  }
  return null;
}

/** Unity event methods a MonoBehaviour can have. */
export const UNITY_EVENTS: { name: string; signature: string; body: string; info: Text2 }[] = [
  { name: 'Start', signature: 'void Start()', body: '', info: { en: 'Runs once, before the first frame. Set things up here.', ru: 'Выполняется один раз перед первым кадром. Здесь всё подготавливают.' } },
  { name: 'Update', signature: 'void Update()', body: '', info: { en: 'Runs every frame (about 60 times a second). Read keys and move here.', ru: 'Выполняется каждый кадр (примерно 60 раз в секунду). Здесь читают клавиши и двигают.' } },
  { name: 'Awake', signature: 'void Awake()', body: '', info: { en: 'Runs once when the object appears, even before Start. Good for GetComponent.', ru: 'Выполняется один раз, когда объект появился, даже раньше Start. Хорошо для GetComponent.' } },
  { name: 'FixedUpdate', signature: 'void FixedUpdate()', body: '', info: { en: 'Runs at fixed physics steps (50 times a second). Work with Rigidbody here.', ru: 'Выполняется шагами физики (50 раз в секунду). Здесь работают с Rigidbody.' } },
  { name: 'LateUpdate', signature: 'void LateUpdate()', body: '', info: { en: 'Runs after all Updates. Good for a camera that follows the player.', ru: 'Выполняется после всех Update. Хорошо для камеры, которая следует за игроком.' } },
  { name: 'OnTriggerEnter2D', signature: 'void OnTriggerEnter2D(Collider2D other)', body: '', info: { en: 'Called when something enters this trigger (Is Trigger is ticked). "other" is what came in.', ru: 'Вызывается, когда что-то вошло в этот триггер (галочка Is Trigger). other — то, что вошло.' } },
  { name: 'OnTriggerExit2D', signature: 'void OnTriggerExit2D(Collider2D other)', body: '', info: { en: 'Called when something leaves the trigger.', ru: 'Вызывается, когда что-то вышло из триггера.' } },
  { name: 'OnCollisionEnter2D', signature: 'void OnCollisionEnter2D(Collision2D collision)', body: '', info: { en: 'Called when this object bumps into another solid object.', ru: 'Вызывается, когда объект врезался в другой твёрдый объект.' } },
  { name: 'OnTriggerEnter', signature: 'void OnTriggerEnter(Collider other)', body: '', info: { en: '3D version of OnTriggerEnter2D.', ru: '3D-версия OnTriggerEnter2D.' } },
  { name: 'OnCollisionEnter', signature: 'void OnCollisionEnter(Collision collision)', body: '', info: { en: '3D version of OnCollisionEnter2D.', ru: '3D-версия OnCollisionEnter2D.' } },
  { name: 'OnEnable', signature: 'void OnEnable()', body: '', info: { en: 'Runs every time the object or script is turned on.', ru: 'Выполняется каждый раз, когда объект или скрипт включают.' } },
  { name: 'OnDisable', signature: 'void OnDisable()', body: '', info: { en: 'Runs every time the object or script is turned off.', ru: 'Выполняется каждый раз, когда объект или скрипт выключают.' } },
  { name: 'OnDestroy', signature: 'void OnDestroy()', body: '', info: { en: 'Runs when the object is destroyed.', ru: 'Выполняется, когда объект уничтожают.' } },
  { name: 'OnMouseDown', signature: 'void OnMouseDown()', body: '', info: { en: 'Called when the object is clicked (it needs a collider).', ru: 'Вызывается при клике по объекту (нужен коллайдер).' } },
];

/** Words valid at the start of a C# statement, with explanations. */
export const CS_WORDS: ApiItem[] = [
  I('public', 'keyword', '', 'Visible to other scripts and in the Unity Inspector.', 'Видно другим скриптам и в Inspector Unity.'),
  I('private', 'keyword', '', 'Only this class can see it.', 'Видно только этому классу.'),
  I('[SerializeField]', 'keyword', '', 'Show a private field in the Inspector.', 'Показать private-поле в Inspector.', '[SerializeField] private ${float} ${speed} = ${5f};'),
  I('int', 'type', '', 'A whole number: 3, -10, 0.', 'Целое число: 3, -10, 0.'),
  I('float', 'type', '', 'A number with a fraction: 2.5f. Unity uses float almost everywhere.', 'Дробное число: 2.5f. В Unity почти везде float.'),
  I('bool', 'type', '', 'true or false.', 'true или false.'),
  I('string', 'type', '', 'Text in quotes.', 'Текст в кавычках.'),
  I('Vector2', 'type', '', 'Two numbers (x, y): a point or a direction in 2D.', 'Два числа (x, y): точка или направление в 2D.'),
  I('Vector3', 'type', '', 'Three numbers (x, y, z): a point or a direction in 3D.', 'Три числа (x, y, z): точка или направление в 3D.'),
  I('GameObject', 'type', '', 'Any object in the scene.', 'Любой объект в сцене.'),
  I('Transform', 'type', '', 'Position, rotation and size of an object.', 'Положение, поворот и размер объекта.'),
  I('Rigidbody2D', 'type', '', 'Physics body in 2D: gravity, speed, forces.', 'Физическое тело в 2D: гравитация, скорость, силы.'),
  I('var', 'keyword', '', 'Let C# guess the type from the value.', 'Пусть C# сам угадает тип по значению.'),
  I('if', 'keyword', '', 'Do something only when a condition is true.', 'Сделать что-то, только если условие верно.', 'if (${condition})\n{\n\t${}\n}'),
  I('else', 'keyword', '', 'Otherwise (when the if condition was false).', 'Иначе (когда условие if было ложным).', 'else\n{\n\t${}\n}'),
  I('for', 'keyword', '', 'Repeat a counted number of times.', 'Повторить заданное число раз.', 'for (int ${i} = 0; ${i} < ${10}; ${i}++)\n{\n\t${}\n}'),
  I('foreach', 'keyword', '', 'Go through every item of a list.', 'Пройти по каждому элементу списка.', 'foreach (var ${item} in ${items})\n{\n\t${}\n}'),
  I('while', 'keyword', '', 'Repeat while a condition is true. Careful in Update: it is already a loop!', 'Повторять, пока условие верно. Осторожно в Update: он уже цикл!', 'while (${condition})\n{\n\t${}\n}'),
  I('switch', 'keyword', '', 'Choose one of many cases.', 'Выбрать один из многих вариантов.', 'switch (${value})\n{\n\tcase ${1}:\n\t\t${}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}'),
  I('return', 'keyword', '', 'Leave the method (and give back a value).', 'Выйти из метода (и вернуть значение).'),
  I('new', 'keyword', '', 'Create a new object.', 'Создать новый объект.'),
  I('class', 'keyword', '', 'A blueprint for objects.', 'Чертёж для объектов.', 'public class ${Name}\n{\n\t${}\n}'),
  I('void', 'keyword', '', 'The method gives nothing back.', 'Метод ничего не возвращает.'),
  I('using', 'keyword', '', 'Connect a library (namespace).', 'Подключить библиотеку (пространство имён).'),
  I('true', 'keyword', '', 'Yes.', 'Да.'),
  I('false', 'keyword', '', 'No.', 'Нет.'),
  I('null', 'keyword', '', 'Nothing: the variable points to no object.', 'Ничего: переменная не указывает ни на какой объект.'),
  I('this', 'keyword', '', 'This very object.', 'Этот самый объект.'),
  I('break', 'keyword', '', 'Leave the loop or the switch case.', 'Выйти из цикла или из case в switch.'),
  I('continue', 'keyword', '', 'Skip to the next round of the loop.', 'Перейти к следующему кругу цикла.'),
  I('try', 'keyword', '', 'Try something that may fail, and catch the error.', 'Попробовать то, что может упасть, и поймать ошибку.', 'try\n{\n\t${}\n}\ncatch (Exception e)\n{\n\tConsole.WriteLine(e.Message);\n}'),
  I('IEnumerator', 'type', '', 'Return type of a coroutine (a method that can wait).', 'Тип корутины (метода, который умеет ждать).', 'IEnumerator ${Routine}()\n{\n\tyield return new WaitForSeconds(${1f});\n\t${}\n}'),
  I('yield return new WaitForSeconds', 'keyword', '', 'Inside a coroutine: wait some seconds, then continue.', 'Внутри корутины: подождать несколько секунд и продолжить.', 'yield return new WaitForSeconds(${1f});'),
  I('List', 'type', '', 'A list that can grow: List<int>, List<string>…', 'Список, который может расти: List<int>, List<string>…', 'List<${int}> ${items} = new List<${int}>();'),
  I('Dictionary', 'type', '', 'Pairs "key → value".', 'Пары «ключ → значение».', 'Dictionary<${string}, ${int}> ${dict} = new Dictionary<${string}, ${int}>();'),
  I('Console.WriteLine', 'function', '', 'Print a line of text.', 'Вывести строку текста.', 'Console.WriteLine(${"Hello"});'),
  I('Debug.Log', 'function', '', 'Write to the Unity Console.', 'Написать в Console Unity.', 'Debug.Log(${"Hello"});'),
  I('Destroy', 'function', '', 'Remove an object from the game.', 'Убрать объект из игры.', 'Destroy(${gameObject});'),
  I('Instantiate', 'function', '', 'Create a copy of a prefab.', 'Создать копию префаба.', 'Instantiate(${prefab}, transform.position, Quaternion.identity);'),
  I('GetComponent', 'function', '', 'Get another component of this object.', 'Получить другой компонент этого объекта.', 'GetComponent<${Rigidbody2D}>()'),
  I('StartCoroutine', 'function', '', 'Start a coroutine.', 'Запустить корутину.', 'StartCoroutine(${Routine}());'),
];

export const PY_WORDS: ApiItem[] = [
  I('print', 'function', '(value)', 'Show a value on the screen.', 'Показать значение на экране.', 'print(${value})'),
  I('input', 'function', '(question)', 'Ask the person and get the answer as text.', 'Спросить человека и получить ответ текстом.', 'input("${Question: }")'),
  I('int', 'function', '(text)', 'Turn text into a whole number.', 'Превратить текст в целое число.', 'int(${text})'),
  I('float', 'function', '(text)', 'Turn text into a fractional number.', 'Превратить текст в дробное число.', 'float(${text})'),
  I('str', 'function', '(value)', 'Turn a value into text.', 'Превратить значение в текст.', 'str(${value})'),
  I('len', 'function', '(list)', 'How many items / characters.', 'Сколько элементов / символов.', 'len(${items})'),
  I('range', 'function', '(n)', 'Numbers 0, 1, … n-1 (for loops).', 'Числа 0, 1, … n-1 (для циклов).', 'range(${10})'),
  I('if', 'keyword', '', 'Do something only when a condition is true.', 'Сделать что-то, только если условие верно.', 'if ${condition}:\n\t${pass}'),
  I('elif', 'keyword', '', 'Otherwise, if…', 'Иначе, если…', 'elif ${condition}:\n\t${pass}'),
  I('else', 'keyword', '', 'Otherwise.', 'Иначе.', 'else:\n\t${pass}'),
  I('for', 'keyword', '', 'Go through items or numbers.', 'Пройти по элементам или числам.', 'for ${i} in range(${10}):\n\t${pass}'),
  I('while', 'keyword', '', 'Repeat while a condition is true.', 'Повторять, пока условие верно.', 'while ${condition}:\n\t${pass}'),
  I('def', 'keyword', '', 'Create a function.', 'Создать функцию.', 'def ${name}(${args}):\n\t${pass}'),
  I('class', 'keyword', '', 'A blueprint for objects.', 'Чертёж для объектов.', 'class ${Name}:\n\tdef __init__(self${, args}):\n\t\t${pass}'),
  I('return', 'keyword', '', 'Give back a value from a function.', 'Вернуть значение из функции.'),
  I('import', 'keyword', '', 'Connect a library.', 'Подключить библиотеку.', 'import ${random}'),
  I('random.randint', 'function', '(a, b)', 'A random whole number from a to b (both included).', 'Случайное целое от a до b (оба включены).', 'random.randint(${1}, ${6})'),
  I('True', 'keyword', '', 'Yes.', 'Да.'),
  I('False', 'keyword', '', 'No.', 'Нет.'),
  I('None', 'keyword', '', 'Nothing.', 'Ничего.'),
  I('append', 'method', '(item)', 'list.append(x) — add to the end of a list.', 'list.append(x) — добавить в конец списка.'),
];

export const JS_WORDS: ApiItem[] = [
  I('console.log', 'function', '(value)', 'Show a value in the console.', 'Показать значение в консоли.', 'console.log(${value});'),
  I('let', 'keyword', '', 'Create a variable that can change.', 'Создать переменную, которую можно менять.', 'let ${name} = ${value};'),
  I('const', 'keyword', '', 'Create a value that will not be reassigned.', 'Создать значение, которое не будут переприсваивать.', 'const ${name} = ${value};'),
  I('function', 'keyword', '', 'Create a function.', 'Создать функцию.', 'function ${name}(${args}) {\n\t${}\n}'),
  I('if', 'keyword', '', 'Only when a condition is true.', 'Только если условие верно.', 'if (${condition}) {\n\t${}\n}'),
  I('for', 'keyword', '', 'Repeat a counted number of times.', 'Повторить заданное число раз.', 'for (let ${i} = 0; ${i} < ${10}; ${i}++) {\n\t${}\n}'),
  I('for of', 'keyword', '', 'Go through every item of an array.', 'Пройти по каждому элементу массива.', 'for (const ${item} of ${items}) {\n\t${}\n}'),
  I('while', 'keyword', '', 'Repeat while a condition is true.', 'Повторять, пока условие верно.', 'while (${condition}) {\n\t${}\n}'),
  I('return', 'keyword', '', 'Give back a value.', 'Вернуть значение.'),
  I('prompt', 'function', '(question)', 'Ask the person a question (answers come from the "Input" box here).', 'Спросить человека (ответы берутся из поля «Ввод»).', 'prompt("${Question}")'),
  I('Math.random', 'function', '()', 'Random number from 0 to 1.', 'Случайное число от 0 до 1.', 'Math.random()'),
  I('Math.floor', 'function', '(x)', 'Round down.', 'Округлить вниз.', 'Math.floor(${x})'),
  I('push', 'method', '(item)', 'array.push(x) — add to the end.', 'array.push(x) — добавить в конец.'),
  I('length', 'property', '', 'How many items / characters.', 'Сколько элементов / символов.'),
];

export const CPP_WORDS: ApiItem[] = [
  I('#include <iostream>', 'keyword', '', 'Connect input/output (std::cout, std::cin).', 'Подключить ввод/вывод (std::cout, std::cin).'),
  I('std::cout', 'function', '', 'Print: std::cout << "text" << std::endl;', 'Вывод: std::cout << "текст" << std::endl;', 'std::cout << ${"text"} << std::endl;'),
  I('std::cin', 'function', '', 'Read input: std::cin >> x;', 'Ввод: std::cin >> x;', 'std::cin >> ${x};'),
  I('std::string', 'type', '', 'Text.', 'Текст.'),
  I('std::vector', 'type', '', 'A list that can grow.', 'Список, который может расти.', 'std::vector<${int}> ${items};'),
  I('int main', 'function', '', 'Where the program starts.', 'Откуда программа начинается.', 'int main() {\n\t${}\n\treturn 0;\n}'),
  I('UPROPERTY', 'keyword', 'Unreal', 'Shows a variable to Unreal (editor, Blueprints, saving).', 'Показывает переменную движку Unreal (редактор, Blueprints, сохранение).', 'UPROPERTY(EditAnywhere, BlueprintReadWrite)\n${float} ${Speed} = ${600.f};'),
  I('UFUNCTION', 'keyword', 'Unreal', 'Shows a function to Unreal (Blueprints can call it).', 'Показывает функцию движку Unreal (её можно вызывать из Blueprints).', 'UFUNCTION(BlueprintCallable)\nvoid ${DoSomething}();'),
  I('UE_LOG', 'function', 'Unreal', 'Write to the Unreal Output Log.', 'Написать в Output Log Unreal.', 'UE_LOG(LogTemp, Warning, TEXT("${Hello}"));'),
  I('BeginPlay', 'function', 'Unreal', 'Like Start in Unity: runs once when the game starts.', 'Как Start в Unity: выполняется один раз в начале игры.'),
  I('Tick', 'function', 'Unreal', 'Like Update in Unity: runs every frame. DeltaTime is passed in.', 'Как Update в Unity: каждый кадр. DeltaTime передаётся параметром.'),
  I('printf', 'function', 'C', 'Print formatted text: printf("%d\\n", x);', 'Вывод по шаблону: printf("%d\\n", x);', 'printf("${%d}\\n", ${x});'),
  I('scanf', 'function', 'C', 'Read input: scanf("%d", &x);', 'Ввод: scanf("%d", &x);', 'scanf("${%d}", &${x});'),
];
