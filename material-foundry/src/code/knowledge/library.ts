// Well-known library and engine functions (C, C++, C#, Unity, Unreal, Python, JavaScript).
// Matching is by name only, so every sentence says "if this is …" and is marked "likely".

import { tr } from '../i18n';

interface Known {
  /** Where it comes from, shown to the user. */
  lib: string;
  /** Language ids it applies to (empty = any). */
  langs: string[];
  en: string;
  ru: string;
}

const K = (lib: string, langs: string[], en: string, ru: string): Known => ({ lib, langs, en, ru });
const C = ['c', 'cpp'];
const CPP = ['cpp'];
const CS = ['csharp'];
const PY = ['python'];
const JS = ['javascript', 'typescript', 'tsx'];

const LIB: Record<string, Known[]> = {
  // C standard library
  printf: [K('C (stdio.h)', C, 'prints formatted text; %d is replaced by a whole number, %s by text, %f by a decimal number', 'печатает текст по шаблону; %d заменяется целым числом, %s — текстом, %f — дробным числом')],
  scanf: [K('C (stdio.h)', C, 'reads values typed by the user into variables (it needs their addresses: &x)', 'читает значения, введённые пользователем, в переменные (ему нужны их адреса: &x)')],
  puts: [K('C (stdio.h)', C, 'prints a line of text', 'печатает строку текста')],
  malloc: [K('C (stdlib.h)', C, 'reserves a block of memory of the given size and returns its address; it must be released with free', 'выделяет блок памяти нужного размера и возвращает его адрес; потом его нужно освободить через free')],
  calloc: [K('C (stdlib.h)', C, 'reserves memory for several items and fills it with zeros', 'выделяет память под несколько элементов и заполняет её нулями')],
  realloc: [K('C (stdlib.h)', C, 'changes the size of a memory block (it may move to a new address)', 'меняет размер блока памяти (он может переехать по новому адресу)')],
  free: [K('C (stdlib.h)', C, 'gives memory from malloc back; the pointer must not be used afterwards', 'возвращает память, взятую через malloc; указателем потом пользоваться нельзя')],
  strlen: [K('C (string.h)', C, 'counts the characters in a text (without the final \\0)', 'считает символы в тексте (без завершающего \\0)')],
  strcpy: [K('C (string.h)', C, 'copies text into another buffer — dangerous if the buffer is too small', 'копирует текст в другой буфер — опасно, если буфер слишком маленький')],
  strcmp: [K('C (string.h)', C, 'compares two texts; 0 means they are equal', 'сравнивает два текста; 0 значит «одинаковые»')],
  memcpy: [K('C (string.h)', C, 'copies a number of bytes from one place in memory to another', 'копирует заданное число байт из одного места памяти в другое')],
  memset: [K('C (string.h)', C, 'fills a block of memory with one byte value (often 0)', 'заполняет блок памяти одним значением (часто 0)')],
  fopen: [K('C (stdio.h)', C, 'opens a file and returns a FILE pointer (NULL if it failed)', 'открывает файл и возвращает указатель FILE (NULL, если не вышло)')],
  fclose: [K('C (stdio.h)', C, 'closes a file opened with fopen', 'закрывает файл, открытый через fopen')],
  rand: [K('C (stdlib.h)', C, 'gives a pseudo-random whole number', 'даёт псевдослучайное целое число')],
  srand: [K('C (stdlib.h)', C, 'sets the starting point (seed) for rand', 'задаёт начальное значение (зерно) для rand')],
  sqrt: [K('C/C++ (math)', C, 'square root', 'квадратный корень')],
  pow: [K('C/C++ (math)', C, 'raises a number to a power', 'возводит число в степень')],
  // C++
  cout: [K('C++ (iostream)', CPP, 'is the console output stream: std::cout << x prints x', 'поток вывода в консоль: std::cout << x печатает x')],
  cin: [K('C++ (iostream)', CPP, 'is the console input stream: std::cin >> x reads x from the keyboard', 'поток ввода с клавиатуры: std::cin >> x читает x')],
  endl: [K('C++ (iostream)', CPP, 'ends the line and flushes the output', 'заканчивает строку и сразу выводит текст')],
  push_back: [K('C++ (std::vector)', CPP, 'adds an element to the end of the vector', 'добавляет элемент в конец вектора')],
  emplace_back: [K('C++ (std::vector)', CPP, 'builds a new element directly at the end of the vector', 'создаёт новый элемент прямо в конце вектора')],
  make_unique: [K('C++ (memory)', CPP, 'creates an object owned by a std::unique_ptr — it is freed automatically', 'создаёт объект во владении std::unique_ptr — он освободится сам')],
  make_shared: [K('C++ (memory)', CPP, 'creates an object owned by a std::shared_ptr (freed when the last owner is gone)', 'создаёт объект во владении std::shared_ptr (освободится, когда исчезнет последний владелец)')],
  move: [K('C++ (utility)', CPP, 'marks a value as "may be moved from", so its contents are handed over instead of copied', 'помечает значение «можно забрать», чтобы содержимое передали, а не копировали')],
  sort: [K('C++ (algorithm) / Python / JS', [], 'sorts elements into order', 'сортирует элементы по порядку')],
  // C# / .NET
  WriteLine: [K('.NET (Console)', CS, 'prints a line of text to the console', 'печатает строку текста в консоль')],
  ReadLine: [K('.NET (Console)', CS, 'reads a line typed by the user', 'читает строку, которую ввёл пользователь')],
  Parse: [K('.NET', CS, 'turns text into a number (throws an error if the text is not a number)', 'превращает текст в число (ошибка, если это не число)')],
  TryParse: [K('.NET', CS, 'tries to turn text into a number and says whether it worked (no error)', 'пробует превратить текст в число и сообщает, получилось ли (без ошибки)')],
  ToString: [K('.NET', CS, 'turns the value into text', 'превращает значение в текст')],
  // Unity
  Log: [K('Unity (Debug)', CS, 'writes a message to the Unity Console — used to check what the game is doing', 'пишет сообщение в консоль Unity — так проверяют, что делает игра')],
  Instantiate: [K('Unity', CS, 'creates a copy of an object (often a prefab) in the scene', 'создаёт копию объекта (часто префаба) в сцене')],
  Destroy: [K('Unity', CS, 'removes an object (or component) from the scene', 'удаляет объект (или компонент) из сцены')],
  GetComponent: [K('Unity', CS, 'finds another component (for example Rigidbody) on the same game object', 'находит другой компонент (например Rigidbody) на том же игровом объекте')],
  AddComponent: [K('Unity', CS, 'adds a new component to a game object while the game runs', 'добавляет новый компонент к игровому объекту во время игры')],
  FindObjectOfType: [K('Unity', CS, 'searches the whole scene for an object of this type (slow — do not call every frame)', 'ищет во всей сцене объект этого типа (медленно — не вызывай каждый кадр)')],
  StartCoroutine: [K('Unity', CS, 'starts a coroutine: a method that can pause (yield) and continue in later frames', 'запускает корутину: метод, который может ставить себя на паузу (yield) и продолжать в следующих кадрах')],
  Invoke: [K('Unity / .NET', CS, 'calls a method later (Unity: by name after a delay) or calls a delegate/event', 'вызывает метод позже (Unity: по имени через задержку) или вызывает делегат/событие')],
  GetKey: [K('Unity (Input)', CS, 'is true while the key is held down', 'верно, пока клавиша зажата')],
  GetKeyDown: [K('Unity (Input)', CS, 'is true only in the frame the key was pressed', 'верно только в тот кадр, когда клавишу нажали')],
  GetAxis: [K('Unity (Input)', CS, 'gives a smooth value from −1 to 1 for an input axis such as "Horizontal"', 'даёт плавное значение от −1 до 1 для оси ввода, например «Horizontal»')],
  Translate: [K('Unity (Transform)', CS, 'moves the object by a vector', 'сдвигает объект на вектор')],
  Rotate: [K('Unity (Transform)', CS, 'turns the object by angles', 'поворачивает объект на углы')],
  LookAt: [K('Unity (Transform)', CS, 'turns the object to face a target', 'поворачивает объект лицом к цели')],
  AddForce: [K('Unity (Rigidbody)', CS, 'pushes a physics object with a force', 'толкает физический объект силой')],
  MoveTowards: [K('Unity (Vector3/Mathf)', CS, 'moves a value towards a target by at most a given step', 'двигает значение к цели не больше чем на заданный шаг')],
  Lerp: [K('Unity (Mathf/Vector3)', CS, 'blends between two values: t = 0 gives the first, t = 1 the second', 'плавно смешивает два значения: t = 0 — первое, t = 1 — второе')],
  Clamp: [K('Unity (Mathf)', CS, 'keeps a number between a minimum and a maximum', 'удерживает число между минимумом и максимумом')],
  Raycast: [K('Unity (Physics)', CS, 'shoots an invisible ray and tells whether it hit something', 'пускает невидимый луч и сообщает, попал ли он во что-то')],
  LoadScene: [K('Unity (SceneManager)', CS, 'switches to another scene (level)', 'переключает на другую сцену (уровень)')],
  Range: [K('Unity (Random)', CS, 'gives a random number between two values', 'даёт случайное число между двумя значениями')],
  deltaTime: [K('Unity (Time)', CS, 'is the time in seconds since the last frame — multiply movement by it so speed does not depend on FPS', 'время в секундах с прошлого кадра — на него умножают движение, чтобы скорость не зависела от FPS')],
  // Unreal
  UE_LOG: [K('Unreal Engine', CPP, 'writes a message to the Output Log', 'пишет сообщение в журнал Output Log')],
  GetWorld: [K('Unreal Engine', CPP, 'gives the world (level) this object lives in', 'даёт мир (уровень), в котором живёт объект')],
  SpawnActor: [K('Unreal Engine', CPP, 'creates a new actor (object) in the world', 'создаёт новый актор (объект) в мире')],
  GetActorLocation: [K('Unreal Engine', CPP, 'gives the actor\'s position (FVector)', 'даёт позицию актора (FVector)')],
  SetActorLocation: [K('Unreal Engine', CPP, 'moves the actor to a position', 'перемещает актора в позицию')],
  AddMovementInput: [K('Unreal Engine', CPP, 'asks the character to move in a direction this frame', 'просит персонажа двигаться в направлении в этом кадре')],
  CreateDefaultSubobject: [K('Unreal Engine', CPP, 'creates a component inside a constructor (for example a mesh or camera)', 'создаёт компонент в конструкторе (например меш или камеру)')],
  Cast: [K('Unreal Engine', CPP, 'safely converts a pointer to a more specific class (gives nullptr if it is not that class)', 'безопасно приводит указатель к более конкретному классу (даёт nullptr, если класс не тот)')],
  // Python
  print: [K('Python', PY, 'shows values on the screen', 'показывает значения на экране')],
  len: [K('Python', PY, 'gives the number of items (length)', 'даёт количество элементов (длину)')],
  range: [K('Python', PY, 'makes a sequence of numbers: range(1, 4) → 1, 2, 3', 'создаёт последовательность чисел: range(1, 4) → 1, 2, 3')],
  input: [K('Python', PY, 'waits for the user to type something and returns it as text', 'ждёт, пока пользователь что-то введёт, и возвращает это как текст')],
  append: [K('Python (list)', PY, 'adds an item to the end of a list', 'добавляет элемент в конец списка')],
  open: [K('Python', PY, 'opens a file for reading or writing', 'открывает файл для чтения или записи')],
  // JavaScript
  log: [K('JavaScript (console)', JS, 'prints values to the browser console', 'печатает значения в консоль браузера')],
  getElementById: [K('JavaScript (DOM)', JS, 'finds the page element with this id', 'находит на странице элемент с этим id')],
  addEventListener: [K('JavaScript (DOM)', JS, 'runs a function when something happens (a click, a key press…)', 'запускает функцию, когда что-то происходит (щелчок, нажатие клавиши…)')],
  setTimeout: [K('JavaScript', JS, 'runs a function once after a delay in milliseconds', 'запускает функцию один раз через заданное число миллисекунд')],
  requestAnimationFrame: [K('JavaScript (browser)', JS, 'calls a function before the next screen refresh — the browser\'s game loop', 'вызывает функцию перед следующей перерисовкой экрана — игровой цикл браузера')],
  push: [K('JavaScript (Array)', JS, 'adds an item to the end of an array', 'добавляет элемент в конец массива')],
  parseInt: [K('JavaScript', JS, 'turns text into a whole number', 'превращает текст в целое число')],
};

/** Methods the engines call by themselves (when defined in your class). */
const ENGINE_CALLBACKS: Record<string, { lib: string; langs: string[]; en: string; ru: string; concept: string }> = {
  Awake: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls Awake once, as soon as the object is created (before Start).', ru: 'Unity вызывает Awake один раз, сразу при создании объекта (раньше Start).' },
  Start: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls Start once, before the first frame in which the object is active.', ru: 'Unity вызывает Start один раз — перед первым кадром, в котором объект активен.' },
  Update: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls Update once per frame — this is where most game logic lives.', ru: 'Unity вызывает Update каждый кадр — здесь живёт большая часть игровой логики.' },
  FixedUpdate: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls FixedUpdate at a fixed rate (50 times per second by default) — use it for physics.', ru: 'Unity вызывает FixedUpdate с постоянной частотой (по умолчанию 50 раз в секунду) — для физики.' },
  LateUpdate: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls LateUpdate every frame after all Update methods — good for cameras.', ru: 'Unity вызывает LateUpdate каждый кадр после всех Update — удобно для камеры.' },
  OnEnable: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnEnable every time the object or script is switched on.', ru: 'Unity вызывает OnEnable каждый раз, когда объект или скрипт включается.' },
  OnDisable: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnDisable when the object or script is switched off.', ru: 'Unity вызывает OnDisable, когда объект или скрипт выключается.' },
  OnDestroy: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnDestroy right before the object is removed.', ru: 'Unity вызывает OnDestroy прямо перед удалением объекта.' },
  OnCollisionEnter: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnCollisionEnter when another physics object hits this one.', ru: 'Unity вызывает OnCollisionEnter, когда в этот объект врезается другой физический объект.' },
  OnTriggerEnter: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnTriggerEnter when something enters this object\'s trigger zone.', ru: 'Unity вызывает OnTriggerEnter, когда что-то входит в зону-триггер этого объекта.' },
  OnTriggerExit: { lib: 'Unity', langs: CS, concept: 'unity-lifecycle', en: 'Unity calls OnTriggerExit when something leaves the trigger zone.', ru: 'Unity вызывает OnTriggerExit, когда что-то выходит из зоны-триггера.' },
  BeginPlay: { lib: 'Unreal Engine', langs: CPP, concept: 'game-loop', en: 'Unreal calls BeginPlay once when the game starts for this actor.', ru: 'Unreal вызывает BeginPlay один раз, когда для этого актора начинается игра.' },
  Tick: { lib: 'Unreal Engine', langs: CPP, concept: 'game-loop', en: 'Unreal calls Tick every frame; DeltaTime is the time since the last frame.', ru: 'Unreal вызывает Tick каждый кадр; DeltaTime — время с прошлого кадра.' },
  EndPlay: { lib: 'Unreal Engine', langs: CPP, concept: 'game-loop', en: 'Unreal calls EndPlay when the actor is removed or the game ends.', ru: 'Unreal вызывает EndPlay, когда актор удаляется или игра заканчивается.' },
};

export const UNREAL_MACROS = new Set(['UCLASS', 'USTRUCT', 'UENUM', 'UPROPERTY', 'UFUNCTION', 'GENERATED_BODY', 'GENERATED_UCLASS_BODY', 'UINTERFACE']);
export const VECTOR_TYPES = new Set(['Vector2', 'Vector3', 'Vector4', 'FVector', 'FVector2D', 'vec2', 'vec3', 'Vector2Int', 'Vector3Int']);
export const LIST_TYPES = new Set(['List', 'vector', 'TArray', 'array', 'ArrayList', 'LinkedList', 'deque', 'IEnumerable', 'IList']);
export const DICT_TYPES = new Set(['Dictionary', 'map', 'unordered_map', 'TMap', 'HashMap', 'SortedDictionary', 'IDictionary']);

const applies = (k: { langs: string[] }, lang: string) => !k.langs.length || k.langs.includes(lang);

/** "If this is … : it …" — or undefined when the name is not known for this language. */
export function libraryMeaning(name: string, lang: string): string | undefined {
  const k = LIB[name]?.find((x) => applies(x, lang));
  if (!k) return undefined;
  return tr(`If this is ${name} from ${k.lib}: it ${k.en}.`, `Если это ${name} из ${k.lib}: ${k.ru}.`);
}

/** Engine callbacks (Unity Update, Unreal Tick…) defined in the user's own class. */
export function engineCallback(name: string, lang: string): { concept: string; text: string } | undefined {
  const k = ENGINE_CALLBACKS[name];
  if (!k || !applies(k, lang)) return undefined;
  return { concept: k.concept, text: tr(k.en, k.ru) };
}
