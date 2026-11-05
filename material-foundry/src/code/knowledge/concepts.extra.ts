// Extra knowledge for the languages people use to make games and programs: C, C++ and C#
// (pointers, references, memory, templates, properties, events) plus Unity / Unreal ideas.
// Every entry is written in English and Russian.

import type { Concept } from './concepts';
import type { RuConcept } from './concepts.ru';

interface Pair {
  id: string;
  en: Omit<Concept, 'id' | 'example' | 'related'> & { explain?: string };
  ru: RuConcept;
  example?: { code: string; lang: string };
  related?: string[];
}

const P = (p: Pair) => p;

const PAIRS: Pair[] = [
  P({
    id: 'pointer',
    example: { lang: 'c', code: 'int health = 100;\nint *p = &health;   // p stores the address of health\n*p = 50;            // health is now 50' },
    related: ['address-of', 'reference', 'operator-pointer-member'],
    en: {
      title: 'Pointer (*)',
      levels: [
        'A pointer is a note with an address on it: "the toy is in the blue box". It is not the toy, it tells you where the toy is.',
        'A pointer is a variable that stores the memory address of another value. With * in front of it you reach that other value.',
        'int *p declares a pointer to int. &x gives the address of x; *p (dereference) reads or writes the value at the address p holds.',
        'Pointers allow sharing data without copying, dynamic memory (malloc/new) and data structures (lists, trees). Dangers: a NULL or dangling pointer (pointing at freed memory) crashes or corrupts the program; pointer arithmetic can run past an array. C++ prefers references and smart pointers (std::unique_ptr) where possible.',
        'Exercise: find which variable this pointer points at, and every line that changes that variable through the pointer.',
      ],
      simpler: ['Like a treasure map: the map is not the treasure, but following it gets you to the treasure.'],
      explain: 'p holds the address of health. Writing *p = 50 follows the address and changes health itself.',
      why: 'Pointers let functions change the caller\'s data and let programs build data whose size is only known while running.',
      change: 'Changing what a pointer points at changes which data every *p line reads or writes. A wrong pointer usually crashes the program.',
    },
    ru: {
      title: 'Указатель (*)',
      levels: [
        'Указатель — это записка с адресом: «игрушка лежит в синей коробке». Это не сама игрушка, а то, где её найти.',
        'Указатель — переменная, которая хранит адрес другого значения в памяти. Со звёздочкой * впереди можно добраться до этого значения.',
        'int *p объявляет указатель на int. &x даёт адрес x; *p (разыменование) читает или пишет значение по адресу из p.',
        'Указатели позволяют делиться данными без копирования, работать с динамической памятью (malloc/new) и строить структуры данных (списки, деревья). Опасности: NULL или «висячий» указатель (на освобождённую память) роняет программу или портит данные; арифметика указателей может выйти за границы массива. В C++ по возможности используют ссылки и умные указатели (std::unique_ptr).',
        'Упражнение: найди, на какую переменную указывает этот указатель, и все строки, которые меняют её через него.',
      ],
      simpler: ['Как карта сокровищ: карта — не сокровище, но по ней его можно найти.'],
      explain: 'p хранит адрес health. Запись *p = 50 идёт по адресу и меняет сам health.',
      why: 'Указатели позволяют функциям менять данные вызывающего и строить данные, размер которых известен только во время работы.',
      change: 'Если изменить, куда смотрит указатель, все строки с *p будут читать и писать другие данные. Неправильный указатель обычно роняет программу.',
    },
  }),
  P({
    id: 'address-of',
    related: ['pointer'],
    en: {
      title: 'Address of (&)',
      levels: [
        '& asks: "where does this box live?" and gives back its address.',
        '&x gives the memory address of x, so a pointer can point at it.',
        'The address-of operator produces a pointer to its operand. Passing &x to a function lets the function change x.',
        'You cannot take the address of a temporary value. Returning the address of a local variable is a bug: the variable disappears when the function ends. In C++ & in a declaration (int& r) means a reference, not "address of".',
        'Exercise: find the pointer that receives this address and what is done with it.',
      ],
      simpler: ['Like asking for someone\'s home address so you can send them a letter.'],
    },
    ru: {
      title: 'Адрес (&)',
      levels: [
        '& спрашивает: «где живёт эта коробка?» — и отдаёт её адрес.',
        '&x даёт адрес переменной x в памяти, чтобы на неё мог смотреть указатель.',
        'Оператор взятия адреса создаёт указатель на значение. Передав &x в функцию, можно позволить ей изменить x.',
        'Нельзя взять адрес временного значения. Возвращать адрес локальной переменной — ошибка: она исчезает после выхода из функции. В C++ & в объявлении (int& r) означает ссылку, а не «адрес».',
        'Упражнение: найди указатель, который получает этот адрес, и что с ним делают.',
      ],
      simpler: ['Как спросить домашний адрес, чтобы отправить письмо.'],
    },
  }),
  P({
    id: 'reference',
    related: ['pointer', 'parameter'],
    en: {
      title: 'Reference (& in C++, ref in C#)',
      levels: [
        'A reference is a second name for the same box. Change it through either name — it is the same box.',
        'A reference lets a function work with the original variable instead of a copy.',
        'int& r = x makes r another name for x (C++). In C#, ref/out parameters pass the variable itself. Class objects in C#/Java are always handled by reference.',
        'A C++ reference must be initialised and cannot be re-pointed. const T& passes big objects without copying and without allowing changes. A reference to a local variable must not outlive it.',
        'Exercise: find which original variable this reference stands for, and where it is changed.',
      ],
      simpler: ['Like a nickname: "Sasha" and "Alexander" are the same person.'],
      why: 'Copying big objects is slow; references avoid copies and let functions change the caller\'s data on purpose.',
    },
    ru: {
      title: 'Ссылка (& в C++, ref в C#)',
      levels: [
        'Ссылка — это второе имя той же коробки. Меняешь по любому имени — меняется одна и та же коробка.',
        'Ссылка позволяет функции работать с самой переменной, а не с её копией.',
        'int& r = x делает r другим именем для x (C++). В C# параметры ref/out передают саму переменную. Объекты классов в C#/Java всегда передаются по ссылке.',
        'Ссылку в C++ нужно сразу инициализировать, и её нельзя «перенаправить». const T& передаёт большие объекты без копирования и без права изменения. Ссылка на локальную переменную не должна жить дольше неё.',
        'Упражнение: найди, какую исходную переменную обозначает эта ссылка и где она меняется.',
      ],
      simpler: ['Как прозвище: «Саша» и «Александр» — один и тот же человек.'],
      why: 'Копировать большие объекты медленно; ссылки избегают копий и позволяют функциям намеренно менять данные вызывающего.',
    },
  }),
  P({
    id: 'operator-scope',
    en: {
      title: 'Double colon (::)',
      levels: [
        ':: means "from inside". std::cout = "cout from the std box".',
        ':: picks a name from inside a namespace or a class: std::vector, Player::Update.',
        'The scope resolution operator qualifies a name with its namespace or class. Outside a class, Player::takeHit defines the class\'s method.',
        '::name (with nothing on the left) means the global name. In C# :: is rare (global::); C# uses dots for namespaces.',
        'Exercise: read the name from left to right — which box contains which?',
      ],
      simpler: ['Like a full address: "Moscow::Tverskaya street".'],
    },
    ru: {
      title: 'Двойное двоеточие (::)',
      levels: [
        ':: значит «изнутри». std::cout — «cout из коробки std».',
        ':: берёт имя изнутри пространства имён или класса: std::vector, Player::Update.',
        'Оператор разрешения области уточняет, откуда имя. Вне класса Player::takeHit задаёт метод этого класса.',
        '::имя (без ничего слева) — глобальное имя. В C# :: почти не встречается (global::); там для пространств имён используют точки.',
        'Упражнение: прочитай имя слева направо — что в чём лежит?',
      ],
      simpler: ['Как полный адрес: «Москва::Тверская улица».'],
    },
  }),
  P({
    id: 'operator-pointer-member',
    related: ['pointer', 'operator-member'],
    en: {
      title: 'Arrow (->)',
      levels: [
        '-> means "follow the address, then take this part".',
        'p->health is the same as (*p).health: take the object the pointer points at and use its field.',
        'The member-access-through-pointer operator. Use . for an object, -> for a pointer to an object.',
        'If the pointer is NULL/nullptr, -> crashes. In C++ smart pointers and iterators also support ->.',
        'Exercise: what type is the thing on the left — an object or a pointer?',
      ],
      simpler: ['Like: "go to the address on the note and open the fridge there".'],
    },
    ru: {
      title: 'Стрелка (->)',
      levels: [
        '-> значит «пройди по адресу и возьми вот эту часть».',
        'p->health — то же самое, что (*p).health: взять объект, на который указывает указатель, и его поле.',
        'Доступ к члену через указатель. Для объекта — точка, для указателя на объект — стрелка.',
        'Если указатель NULL/nullptr, -> роняет программу. В C++ стрелку поддерживают и умные указатели, и итераторы.',
        'Упражнение: что слева — сам объект или указатель на него?',
      ],
      simpler: ['Как «дойди по адресу из записки и открой там холодильник».'],
    },
  }),
  P({
    id: 'preprocessor',
    en: {
      title: 'Preprocessor command (#include, #define)',
      levels: [
        'Lines starting with # are instructions for a helper who prepares the text before the computer reads it.',
        '#include pastes in another file (usually a library header); #define gives a name to a value or a piece of code.',
        'The preprocessor runs before compilation: it copies included files, replaces macros and keeps or drops code with #if/#ifdef.',
        'Macros are plain text replacement — no types, no scopes, easy to misuse; C++ prefers const/constexpr and inline functions. Header guards (#pragma once / #ifndef) stop a file being included twice.',
        'Exercise: find what this line brings in or replaces, and where that is used.',
      ],
      simpler: ['Like preparing ingredients before cooking: everything is laid out before the real work starts.'],
    },
    ru: {
      title: 'Команда препроцессора (#include, #define)',
      levels: [
        'Строки с # — указания помощнику, который готовит текст до того, как компьютер его прочитает.',
        '#include вставляет другой файл (обычно заголовок библиотеки); #define даёт имя значению или куску кода.',
        'Препроцессор работает до компиляции: копирует подключённые файлы, подставляет макросы, оставляет или выкидывает код по #if/#ifdef.',
        'Макросы — простая замена текста: без типов и областей видимости, легко ошибиться; в C++ лучше const/constexpr и inline-функции. «Стражи» (#pragma once / #ifndef) не дают подключить файл дважды.',
        'Упражнение: найди, что эта строка подключает или заменяет и где это используется.',
      ],
      simpler: ['Как подготовить продукты перед готовкой: всё разложено до начала работы.'],
    },
  }),
  P({
    id: 'header-file',
    en: {
      title: 'Header file (.h / .hpp)',
      levels: [
        'A header is a table of contents: it lists what exists, the real work is in another file.',
        'A .h file declares functions and classes so other files can use them; the code is usually in a .c/.cpp file.',
        'Headers hold declarations (signatures, class layouts, constants); source files hold definitions. #include copies the header text.',
        'Changing a header recompiles every file that includes it. Definitions placed in headers can cause "multiple definition" errors unless inline or templates.',
        'Exercise: find the .c/.cpp file that implements what this header declares.',
      ],
      simpler: ['Like a restaurant menu: it lists dishes, the kitchen makes them.'],
    },
    ru: {
      title: 'Заголовочный файл (.h / .hpp)',
      levels: [
        'Заголовок — это оглавление: в нём перечислено, что есть, а сама работа — в другом файле.',
        'Файл .h объявляет функции и классы, чтобы другие файлы могли ими пользоваться; код обычно лежит в .c/.cpp.',
        'В заголовках — объявления (сигнатуры, устройство классов, константы), в исходниках — определения. #include копирует текст заголовка.',
        'Изменение заголовка заставляет перекомпилировать все файлы, которые его подключают. Определения в заголовках могут дать ошибку «multiple definition», если это не inline и не шаблоны.',
        'Упражнение: найди .c/.cpp файл, который реализует то, что объявлено в этом заголовке.',
      ],
      simpler: ['Как меню в ресторане: в нём перечислены блюда, а готовит кухня.'],
    },
  }),
  P({
    id: 'template',
    related: ['type', 'list'],
    en: {
      title: 'Template / generic (<T>)',
      levels: [
        'A template is a box shape that fits anything: a box for toys, a box for books — same shape.',
        'A template (generic) writes code once that works with many types: List<int>, List<string>.',
        'template<typename T> (C++) or class Box<T> (C#) declares a type parameter; the compiler fills it in for each use.',
        'C++ templates are expanded per type at compile time (fast, but long error messages); C# generics keep one definition with type checks. Constraints (where T : …, concepts) limit which types are allowed.',
        'Exercise: which concrete types are used for T in this file?',
      ],
      simpler: ['Like a cookie cutter that works with any dough.'],
    },
    ru: {
      title: 'Шаблон / обобщение (<T>)',
      levels: [
        'Шаблон — это форма коробки, в которую влезает что угодно: коробка для игрушек, коробка для книг — форма одна.',
        'Шаблон (обобщение) — код, написанный один раз для многих типов: List<int>, List<string>.',
        'template<typename T> (C++) или class Box<T> (C#) объявляет параметр-тип; компилятор подставляет конкретный тип при использовании.',
        'Шаблоны C++ разворачиваются для каждого типа при компиляции (быстро, но длинные сообщения об ошибках); обобщения C# хранят одно определение с проверкой типов. Ограничения (where T : …, concepts) задают допустимые типы.',
        'Упражнение: какие конкретные типы подставляются вместо T в этом файле?',
      ],
      simpler: ['Как формочка для печенья, которая подходит к любому тесту.'],
    },
  }),
  P({
    id: 'memory-alloc',
    related: ['memory-free', 'pointer'],
    en: {
      title: 'Getting memory (new, malloc)',
      levels: [
        'This asks the computer for a new empty shelf to put things on.',
        'new (C++) or malloc (C) reserves memory while the program runs and gives back its address.',
        'Dynamic allocation creates data on the heap; it lives until it is freed (delete/free), not until the function ends.',
        'Every allocation needs exactly one matching free: forgetting it leaks memory, freeing twice or using after free corrupts memory. Modern C++ uses std::make_unique / std::vector instead of raw new. C# and Java free memory automatically (garbage collector).',
        'Exercise: find where this memory is freed again.',
      ],
      simpler: ['Like renting a locker: it is yours until you give the key back.'],
    },
    ru: {
      title: 'Выделение памяти (new, malloc)',
      levels: [
        'Это просьба к компьютеру: дай новую пустую полку, чтобы что-то на неё положить.',
        'new (C++) или malloc (C) выделяет память во время работы программы и возвращает её адрес.',
        'Динамическое выделение создаёт данные в «куче»; они живут, пока их не освободят (delete/free), а не до конца функции.',
        'Каждому выделению нужно ровно одно освобождение: забыл — утечка памяти, освободил дважды или пользуешься после освобождения — порча памяти. Современный C++ использует std::make_unique / std::vector вместо голого new. В C# и Java память освобождается сама (сборщик мусора).',
        'Упражнение: найди, где эта память освобождается.',
      ],
      simpler: ['Как арендовать шкафчик: он твой, пока не вернёшь ключ.'],
    },
  }),
  P({
    id: 'memory-free',
    related: ['memory-alloc'],
    en: {
      title: 'Freeing memory (delete, free)',
      levels: [
        'This gives the shelf back so others can use it.',
        'delete (C++) or free (C) returns memory that was taken with new/malloc.',
        'After freeing, the pointer still holds the old address but must not be used ("dangling pointer"). Setting it to nullptr/NULL helps.',
        'delete[] is required for arrays made with new[]. In C++ destructors and smart pointers free memory automatically (RAII).',
        'Exercise: check that nothing uses this memory after this line.',
      ],
      simpler: ['Like returning the locker key.'],
    },
    ru: {
      title: 'Освобождение памяти (delete, free)',
      levels: [
        'Это вернуть полку, чтобы ею могли пользоваться другие.',
        'delete (C++) или free (C) возвращает память, взятую через new/malloc.',
        'После освобождения указатель всё ещё хранит старый адрес, но пользоваться им нельзя («висячий указатель»). Помогает присвоить ему nullptr/NULL.',
        'Для массивов из new[] нужен delete[]. В C++ деструкторы и умные указатели освобождают память сами (RAII).',
        'Упражнение: проверь, что после этой строки никто не пользуется этой памятью.',
      ],
      simpler: ['Как вернуть ключ от шкафчика.'],
    },
  }),
  P({
    id: 'destructor',
    en: {
      title: 'Destructor (~ClassName)',
      levels: [
        'A destructor is the "clean up before leaving" step of an object.',
        'The destructor runs automatically when an object is destroyed and frees what it owned.',
        '~Player() in C++ is called when the object goes out of scope or is deleted. It releases memory, files and other resources.',
        'RAII: tie a resource to an object so the destructor always releases it, even on errors. Base classes used polymorphically need a virtual destructor. C# has finalizers (~Name) but prefers IDisposable/using.',
        'Exercise: what does this destructor clean up?',
      ],
      simpler: ['Like tidying your room before moving out.'],
    },
    ru: {
      title: 'Деструктор (~ИмяКласса)',
      levels: [
        'Деструктор — это шаг «прибраться перед уходом» у объекта.',
        'Деструктор вызывается сам, когда объект уничтожается, и освобождает то, чем объект владел.',
        '~Player() в C++ вызывается, когда объект выходит из области видимости или удаляется через delete. Он освобождает память, файлы и другие ресурсы.',
        'RAII: ресурс привязывают к объекту, чтобы деструктор всегда его освободил, даже при ошибке. Базовым классам для полиморфизма нужен virtual-деструктор. В C# есть финализаторы (~Имя), но обычно используют IDisposable/using.',
        'Упражнение: что убирает этот деструктор?',
      ],
      simpler: ['Как убрать комнату перед переездом.'],
    },
  }),
  P({
    id: 'virtual',
    related: ['inheritance', 'method'],
    en: {
      title: 'virtual / override (replacing behaviour)',
      levels: [
        'virtual says: "children may do this their own way". override says: "I do it my own way".',
        'A virtual method can be replaced in a child class; override marks the replacement.',
        'When a virtual method is called through a base-class reference, the version of the real object\'s class runs (polymorphism).',
        'Without virtual (C++/C#) the base version runs even for child objects. abstract methods have no body and must be overridden. Unity uses override for methods from your own base classes; Unreal marks overrides with "override" and often calls Super::.',
        'Exercise: find the base version and every override of this method.',
      ],
      simpler: ['Like the rule "every animal makes a sound": the dog barks, the cat meows.'],
    },
    ru: {
      title: 'virtual / override (переопределение)',
      levels: [
        'virtual говорит: «наследники могут сделать это по-своему». override говорит: «а я делаю это по-своему».',
        'Виртуальный метод можно заменить в классе-наследнике; override отмечает замену.',
        'Если вызвать виртуальный метод через ссылку на базовый класс, выполнится версия настоящего класса объекта (полиморфизм).',
        'Без virtual (C++/C#) для наследников вызывается базовая версия. abstract-методы без тела обязательно переопределяются. В Unreal переопределения помечают override и часто вызывают Super::.',
        'Упражнение: найди базовую версию этого метода и все её переопределения.',
      ],
      simpler: ['Как правило «каждое животное издаёт звук»: собака лает, кошка мяукает.'],
    },
  }),
  P({
    id: 'accessor',
    related: ['property'],
    en: {
      title: 'Property with get / set (C#)',
      levels: [
        'A property looks like a box, but behind it there is a small guard who checks what goes in and out.',
        'get runs when the value is read, set when it is written. The outside sees a simple field.',
        'C# properties ({ get; set; }) wrap a field; set receives the new value as "value". Auto-properties need no body.',
        'set can validate (no negative health) or notify others (raise an event). { get; private set; } lets everyone read but only the class write. Unity does not show properties in the Inspector — fields with [SerializeField] are used for that.',
        'Exercise: what happens when this property is written?',
      ],
      simpler: ['Like a bank teller: you ask for money, they check before giving it.'],
    },
    ru: {
      title: 'Свойство с get / set (C#)',
      levels: [
        'Свойство выглядит как коробка, но за ней стоит маленький охранник, который проверяет, что кладут и берут.',
        'get срабатывает при чтении значения, set — при записи. Снаружи это выглядит как обычное поле.',
        'Свойства C# ({ get; set; }) оборачивают поле; в set новое значение приходит как value. Автосвойства не требуют тела.',
        'set может проверять значение (здоровье не меньше нуля) или сообщать другим (вызвать событие). { get; private set; } — читать могут все, менять только сам класс. Unity не показывает свойства в Инспекторе — для этого используют поля с [SerializeField].',
        'Упражнение: что происходит при записи в это свойство?',
      ],
      simpler: ['Как кассир в банке: просишь деньги — он сначала проверяет.'],
    },
  }),
  P({
    id: 'delegate-event',
    en: {
      title: 'Delegate and event (C#)',
      levels: [
        'An event is a doorbell: when it rings, everyone who signed up hears it.',
        'A delegate holds "which function to call". An event lets other code subscribe (+=) and be called when something happens.',
        'event Action OnDeath; others subscribe with OnDeath += Handler; the owner raises it with OnDeath?.Invoke().',
        'Forgetting to unsubscribe (-=) keeps objects alive and calls handlers on destroyed objects — a classic Unity bug. UnityEvent shows subscribers in the Inspector.',
        'Exercise: find who subscribes to this event and where it is raised.',
      ],
      simpler: ['Like a newsletter: you sign up once and get every new issue.'],
    },
    ru: {
      title: 'Делегат и событие (C#)',
      levels: [
        'Событие — это дверной звонок: когда звонят, слышат все, кто подписался.',
        'Делегат хранит «какую функцию вызвать». Событие позволяет другому коду подписаться (+=) и получать вызов, когда что-то происходит.',
        'event Action OnDeath; другие подписываются OnDeath += Handler; владелец вызывает OnDeath?.Invoke().',
        'Если забыть отписаться (-=), объекты не удаляются, а обработчики вызываются у уничтоженных объектов — классическая ошибка в Unity. UnityEvent показывает подписчиков в Инспекторе.',
        'Упражнение: найди, кто подписан на это событие и где оно вызывается.',
      ],
      simpler: ['Как рассылка: подписался один раз — получаешь каждый новый выпуск.'],
    },
  }),
  P({
    id: 'linq',
    en: {
      title: 'LINQ query (C#)',
      levels: [
        'LINQ is asking a list a question: "give me only the red balls, sorted by size".',
        'LINQ filters, sorts and transforms collections: enemies.Where(e => e.Health > 0).OrderBy(e => e.Distance).',
        'LINQ methods (Where, Select, OrderBy, First, Count…) or query syntax (from … where … select) work on any IEnumerable.',
        'LINQ is lazy: the query runs when it is enumerated (foreach, ToList). It allocates memory — in hot game code (Update every frame) a plain loop is often faster.',
        'Exercise: describe in words what this query returns.',
      ],
      simpler: ['Like a search filter in an online shop.'],
    },
    ru: {
      title: 'LINQ-запрос (C#)',
      levels: [
        'LINQ — это вопрос к списку: «дай только красные мячи, по размеру».',
        'LINQ фильтрует, сортирует и преобразует коллекции: enemies.Where(e => e.Health > 0).OrderBy(e => e.Distance).',
        'Методы LINQ (Where, Select, OrderBy, First, Count…) или запросы (from … where … select) работают с любым IEnumerable.',
        'LINQ ленивый: запрос выполняется при переборе (foreach, ToList). Он выделяет память — в «горячем» игровом коде (Update каждый кадр) обычный цикл часто быстрее.',
        'Упражнение: опиши словами, что возвращает этот запрос.',
      ],
      simpler: ['Как фильтр поиска в интернет-магазине.'],
    },
  }),
  P({
    id: 'nullable',
    related: ['null'],
    en: {
      title: 'May be empty (?)',
      levels: [
        'The ? says: "this box might be empty".',
        'int? (C#) can hold a number or nothing (null). ?. reads a field only if the object exists.',
        'Nullable types and null-conditional operators (?., ??) make "no value" explicit and avoid crashes.',
        '?? gives a default: name ?? "Player". In Unity, ?. does not work reliably with destroyed objects — use if (obj != null).',
        'Exercise: what happens here when the value is null?',
      ],
      simpler: ['Like a seat with the sign "may be free".'],
    },
    ru: {
      title: 'Может быть пустым (?)',
      levels: [
        '? говорит: «эта коробка может оказаться пустой».',
        'int? (C#) хранит число или ничего (null). ?. читает поле, только если объект существует.',
        'Типы, допускающие null, и операторы ?. и ?? делают «нет значения» явным и защищают от падений.',
        '?? даёт значение по умолчанию: name ?? "Player". В Unity ?. ненадёжно работает с уничтоженными объектами — лучше if (obj != null).',
        'Упражнение: что происходит здесь, если значение null?',
      ],
      simpler: ['Как кресло с табличкой «может быть свободно».'],
    },
  }),
  P({
    id: 'list',
    related: ['loop-for', 'template'],
    example: { lang: 'csharp', code: 'List<string> items = new List<string>();\nitems.Add("sword");\nitems.Add("potion");\nDebug.Log(items.Count); // 2' },
    en: {
      title: 'List / array',
      levels: [
        'A list is a row of numbered boxes under one name.',
        'An array or list keeps many values in order; each has a position number (index) starting at 0.',
        'Arrays have a fixed size (int[5]); lists grow and shrink (List<T>, std::vector<T>, TArray<T>). items[0] is the first element.',
        'Reading past the end is an error (C# exception) or undefined behaviour (C/C++). Removing elements while looping over the same list causes bugs. Adding to a std::vector can move it in memory and invalidate pointers to its elements.',
        'Exercise: what is the first and the last element, and where is the list changed?',
      ],
      simpler: ['Like a train: one train, many numbered carriages.'],
      explain: 'The list starts empty, gets "sword" and "potion", and then holds 2 items.',
    },
    ru: {
      title: 'Список / массив',
      levels: [
        'Список — это ряд пронумерованных коробок под одним именем.',
        'Массив или список хранит много значений по порядку; у каждого есть номер (индекс), начиная с 0.',
        'Массивы фиксированного размера (int[5]); списки растут и уменьшаются (List<T>, std::vector<T>, TArray<T>). items[0] — первый элемент.',
        'Чтение за концом — ошибка (исключение в C#) или неопределённое поведение (C/C++). Удаление элементов во время перебора того же списка даёт ошибки. Добавление в std::vector может переместить его в памяти, и указатели на элементы станут недействительными.',
        'Упражнение: какой элемент первый и какой последний, и где список меняется?',
      ],
      simpler: ['Как поезд: поезд один, вагонов много, у каждого номер.'],
      explain: 'Список сначала пустой, в него добавляют «sword» и «potion», и в нём становится 2 предмета.',
    },
  }),
  P({
    id: 'dictionary',
    en: {
      title: 'Dictionary (key → value)',
      levels: [
        'A dictionary is like a real dictionary: you look up a word and find its meaning.',
        'A dictionary (map) stores pairs: a key and its value, e.g. "gold" → 50.',
        'Dictionary<TKey,TValue> (C#), std::map / std::unordered_map (C++), dict (Python), TMap (Unreal). Lookup by key is fast.',
        'Reading a missing key throws (C# indexer) or silently inserts a default (C++ operator[]). TryGetValue / find / get avoid surprises.',
        'Exercise: which keys are stored, and where are they read?',
      ],
      simpler: ['Like a phone book: name → number.'],
    },
    ru: {
      title: 'Словарь (ключ → значение)',
      levels: [
        'Словарь — как настоящий словарь: ищешь слово и находишь его значение.',
        'Словарь (map) хранит пары: ключ и значение, например «gold» → 50.',
        'Dictionary<TKey,TValue> (C#), std::map / std::unordered_map (C++), dict (Python), TMap (Unreal). Поиск по ключу быстрый.',
        'Чтение отсутствующего ключа даёт исключение (индексатор C#) или тихо добавляет значение по умолчанию (operator[] в C++). TryGetValue / find / get помогают избежать сюрпризов.',
        'Упражнение: какие ключи хранятся и где они читаются?',
      ],
      simpler: ['Как телефонная книга: имя → номер.'],
    },
  }),
  P({
    id: 'main-function',
    related: ['function'],
    en: {
      title: 'Main function (the starting point)',
      levels: [
        'main is the front door: the program always comes in here first.',
        'main (Main in C#) is where the program starts running.',
        'The operating system calls main; when it returns, the program ends. Its return value (0 = success) is reported back.',
        'main may receive command-line arguments (argc/argv, string[] args). Games built with engines (Unity, Unreal) have no main of their own — the engine owns it and calls your code.',
        'Exercise: follow the program from the first line of main and list the functions it calls.',
      ],
      simpler: ['Like the first page of a book.'],
    },
    ru: {
      title: 'Главная функция (точка старта)',
      levels: [
        'main — это входная дверь: программа всегда сначала заходит сюда.',
        'main (Main в C#) — место, откуда программа начинает работу.',
        'Операционная система вызывает main; когда она заканчивается, заканчивается и программа. Возвращаемое число (0 — успех) сообщается системе.',
        'main может получать аргументы командной строки (argc/argv, string[] args). В играх на движках (Unity, Unreal) своего main нет — им владеет движок и сам вызывает твой код.',
        'Упражнение: пройди программу с первой строки main и перечисли, какие функции она вызывает.',
      ],
      simpler: ['Как первая страница книги.'],
    },
  }),
  P({
    id: 'cast',
    en: {
      title: 'Type conversion (cast)',
      levels: [
        'A cast says: "treat this as a different kind of thing".',
        '(int)3.7 turns a decimal into a whole number (3). (Player)obj says "this object is a Player".',
        'Explicit casts convert between types; C++ has static_cast, dynamic_cast, reinterpret_cast; C# has (T)x and x as T.',
        'Casting a decimal to an integer drops the fraction; casting a big number to a small type can overflow; a wrong object cast throws (C#) or gives nonsense (C/C++ C-style casts).',
        'Exercise: what value or type do you get after this cast?',
      ],
      simpler: ['Like pouring water from a big jug into a small glass — some may not fit.'],
    },
    ru: {
      title: 'Преобразование типа (cast)',
      levels: [
        'Приведение типа говорит: «считай это вещью другого вида».',
        '(int)3.7 превращает дробное число в целое (3). (Player)obj говорит «этот объект — Player».',
        'Явное приведение преобразует типы; в C++ есть static_cast, dynamic_cast, reinterpret_cast; в C# — (T)x и x as T.',
        'При приведении дробного к целому дробная часть теряется; большое число в маленький тип может переполниться; неверное приведение объекта даёт исключение (C#) или чепуху (C-приведение в C/C++).',
        'Упражнение: какое значение или тип получится после приведения?',
      ],
      simpler: ['Как перелить воду из большого кувшина в маленький стакан — что-то может не поместиться.'],
    },
  }),
  P({
    id: 'sizeof',
    en: {
      title: 'sizeof (size in bytes)',
      levels: [
        'sizeof asks: "how much space does this take?".',
        'sizeof(x) gives how many bytes a type or variable uses in memory.',
        'sizeof is computed by the compiler. sizeof(arr) / sizeof(arr[0]) counts elements of a real array.',
        'For a pointer, sizeof gives the pointer size (4 or 8), not the array size — a common bug when arrays are passed to functions.',
        'Exercise: what number does this sizeof give on a 64-bit computer?',
      ],
      simpler: ['Like measuring how many shelves a box takes.'],
    },
    ru: {
      title: 'sizeof (размер в байтах)',
      levels: [
        'sizeof спрашивает: «сколько места это занимает?».',
        'sizeof(x) даёт, сколько байт занимает тип или переменная в памяти.',
        'sizeof вычисляет компилятор. sizeof(arr) / sizeof(arr[0]) считает элементы настоящего массива.',
        'Для указателя sizeof даёт размер указателя (4 или 8), а не массива — частая ошибка, когда массив передают в функцию.',
        'Упражнение: какое число даст этот sizeof на 64-битном компьютере?',
      ],
      simpler: ['Как измерить, сколько полок занимает коробка.'],
    },
  }),
  P({
    id: 'typedef',
    en: {
      title: 'Type alias (typedef, using)',
      levels: [
        'A short nickname for a long type name.',
        'typedef / using gives a type a new, shorter or clearer name.',
        'typedef struct Player Player; or using Health = int; creates an alias — not a new type.',
        'Aliases improve readability but do not add type safety (Health and int stay interchangeable).',
        'Exercise: what is the real type behind this name?',
      ],
      simpler: ['Like calling "Alexander" just "Sasha".'],
    },
    ru: {
      title: 'Псевдоним типа (typedef, using)',
      levels: [
        'Короткое прозвище для длинного названия типа.',
        'typedef / using даёт типу новое, более короткое или понятное имя.',
        'typedef struct Player Player; или using Health = int; создаёт псевдоним — не новый тип.',
        'Псевдонимы улучшают читаемость, но не защищают от ошибок типов (Health и int остаются взаимозаменяемыми).',
        'Упражнение: какой настоящий тип скрывается за этим именем?',
      ],
      simpler: ['Как называть «Александра» просто «Сашей».'],
    },
  }),
  P({
    id: 'unity-lifecycle',
    related: ['game-loop', 'method'],
    example: { lang: 'csharp', code: 'public class Mover : MonoBehaviour\n{\n    public float speed = 2f;\n\n    void Update()\n    {\n        transform.position += Vector3.right * speed * Time.deltaTime;\n    }\n}' },
    en: {
      title: 'Unity method (Start, Update, …)',
      levels: [
        'Unity calls these methods by itself at the right moment, like an alarm clock.',
        'Start runs once when the object appears; Update runs every frame; OnCollisionEnter runs when something hits the object.',
        'MonoBehaviour messages: Awake → OnEnable → Start, then Update/FixedUpdate/LateUpdate every frame, OnTrigger*/OnCollision* on physics events, OnDestroy at the end.',
        'Unity finds them by exact name (no override keyword), so a typo (update instead of Update) silently does nothing. Movement in Update should be multiplied by Time.deltaTime; physics belongs in FixedUpdate.',
        'Exercise: decide which of these methods runs first and how often each runs.',
      ],
      simpler: ['Like a school timetable: the bell (Unity) tells each lesson (method) when to start.'],
      explain: 'Every frame Unity calls Update, which moves the object to the right. Time.deltaTime keeps the speed the same on fast and slow computers.',
    },
    ru: {
      title: 'Метод Unity (Start, Update, …)',
      levels: [
        'Unity сама вызывает эти методы в нужный момент, как будильник.',
        'Start выполняется один раз, когда объект появился; Update — каждый кадр; OnCollisionEnter — когда в объект что-то врезалось.',
        'Сообщения MonoBehaviour: Awake → OnEnable → Start, затем каждый кадр Update/FixedUpdate/LateUpdate, OnTrigger*/OnCollision* при физических событиях, OnDestroy в конце.',
        'Unity находит их по точному имени (без override), поэтому опечатка (update вместо Update) молча ничего не делает. Движение в Update умножают на Time.deltaTime; физику пишут в FixedUpdate.',
        'Упражнение: реши, какой из этих методов выполнится первым и как часто выполняется каждый.',
      ],
      simpler: ['Как школьное расписание: звонок (Unity) говорит каждому уроку (методу), когда начинаться.'],
      explain: 'Каждый кадр Unity вызывает Update, и объект сдвигается вправо. Time.deltaTime делает скорость одинаковой на быстрых и медленных компьютерах.',
    },
  }),
  P({
    id: 'unreal-macro',
    en: {
      title: 'Unreal macro (UCLASS, UPROPERTY, UFUNCTION)',
      levels: [
        'These capital-letter words are stickers that tell Unreal Engine: "please notice this".',
        'UCLASS marks a class for the engine, UPROPERTY shows a variable in the editor/Blueprints, UFUNCTION makes a function callable from Blueprints.',
        'Unreal Header Tool reads these macros and generates code for reflection, saving, networking and the editor. GENERATED_BODY() inserts that code.',
        'Without UPROPERTY, UObject pointers are invisible to the garbage collector and may be destroyed unexpectedly. Specifiers (EditAnywhere, BlueprintCallable…) control what the editor allows.',
        'Exercise: read the specifiers in the brackets and say what the editor will allow.',
      ],
      simpler: ['Like name tags at a party so the host knows who is who.'],
    },
    ru: {
      title: 'Макрос Unreal (UCLASS, UPROPERTY, UFUNCTION)',
      levels: [
        'Эти слова заглавными буквами — наклейки для Unreal Engine: «обрати на это внимание».',
        'UCLASS отмечает класс для движка, UPROPERTY показывает переменную в редакторе и Blueprints, UFUNCTION позволяет вызывать функцию из Blueprints.',
        'Unreal Header Tool читает эти макросы и генерирует код для отражения, сохранения, сети и редактора. GENERATED_BODY() вставляет этот код.',
        'Без UPROPERTY указатели на UObject не видны сборщику мусора и могут неожиданно удалиться. Спецификаторы (EditAnywhere, BlueprintCallable…) управляют тем, что позволяет редактор.',
        'Упражнение: прочитай спецификаторы в скобках и скажи, что разрешит редактор.',
      ],
      simpler: ['Как бейджики на празднике, чтобы хозяин знал, кто есть кто.'],
    },
  }),
  P({
    id: 'game-loop',
    related: ['loop-while', 'unity-lifecycle'],
    en: {
      title: 'Game loop',
      levels: [
        'A game is a flip-book: it draws a picture, changes it a little, draws again — very fast.',
        'The game loop repeats many times per second: read input, update the world, draw the frame.',
        'Each iteration is one frame (60 frames per second = every ~16 ms). Engines run the loop and call your Update/Tick.',
        'Use the time between frames (deltaTime) so speed does not depend on frame rate. Heavy work in the loop lowers FPS; physics often runs at a fixed step.',
        'Exercise: in this code, find what happens once per frame.',
      ],
      simpler: ['Like a cartoon: many pictures per second look like movement.'],
    },
    ru: {
      title: 'Игровой цикл',
      levels: [
        'Игра — как мультфильм-книжка: нарисовать картинку, чуть изменить, нарисовать снова — очень быстро.',
        'Игровой цикл повторяется много раз в секунду: прочитать ввод, обновить мир, нарисовать кадр.',
        'Каждый повтор — один кадр (60 кадров в секунду — каждые ~16 мс). Движки сами крутят цикл и вызывают твои Update/Tick.',
        'Используй время между кадрами (deltaTime), чтобы скорость не зависела от частоты кадров. Тяжёлая работа в цикле снижает FPS; физика часто считается с фиксированным шагом.',
        'Упражнение: найди в этом коде то, что происходит один раз за кадр.',
      ],
      simpler: ['Как мультик: много картинок в секунду выглядят как движение.'],
    },
  }),
  P({
    id: 'vector',
    en: {
      title: 'Vector (position / direction: Vector3)',
      levels: [
        'A vector is an arrow: where to go and how far.',
        'Vector2/Vector3 (Unity), FVector (Unreal) hold x, y (and z): a position, a direction or a speed.',
        'Vectors support +, −, multiplication by a number; .magnitude/.Size() is the length; .normalized gives direction with length 1.',
        'Vector3.right * speed * Time.deltaTime is the standard movement step. Comparing floating-point vectors with == is unreliable; use a small tolerance.',
        'Exercise: which way does this vector point, and how long is it?',
      ],
      simpler: ['Like directions: "3 steps right, 2 steps forward".'],
    },
    ru: {
      title: 'Вектор (позиция / направление: Vector3)',
      levels: [
        'Вектор — это стрелка: куда идти и как далеко.',
        'Vector2/Vector3 (Unity), FVector (Unreal) хранят x, y (и z): позицию, направление или скорость.',
        'Векторы можно складывать, вычитать, умножать на число; .magnitude/.Size() — длина; .normalized даёт направление длиной 1.',
        'Vector3.right * speed * Time.deltaTime — стандартный шаг движения. Сравнивать дробные векторы через == ненадёжно; используют небольшой допуск.',
        'Упражнение: куда указывает этот вектор и какой он длины?',
      ],
      simpler: ['Как подсказка: «3 шага вправо, 2 шага вперёд».'],
    },
  }),
];

export const EXTRA_CONCEPTS: Concept[] = PAIRS.map((p) => ({
  id: p.id,
  title: p.en.title,
  levels: p.en.levels,
  simpler: p.en.simpler,
  why: p.en.why,
  change: p.en.change,
  related: p.related,
  example: p.example ? { ...p.example, explain: p.en.explain ?? '' } : undefined,
}));

export const EXTRA_RU: Record<string, RuConcept> = Object.fromEntries(PAIRS.map((p) => [p.id, p.ru]));
