// Courses: longer paths after the first lessons.
//  • "C# for Unity" — 16 lessons. Every example really runs in the safe C# interpreter, so the
//    step-by-step animation shows real values; every lesson ends with a small task that is checked
//    by running the learner's code and comparing what it prints.
//  • "Unreal Engine C++" — 4 reading lessons (C++ cannot run here; this is said honestly).
// The tests run every example and every reference solution (tests/courses.test.ts).

import type { Text2 } from '../i18n';

export interface Quiz {
  q: Text2;
  options: (string | Text2)[];
  answer: number;
  why: Text2;
}

export interface CourseTask {
  text: Text2;
  starter: string;
  /** What the program must print, line by line. */
  expect: string[];
  /** Answers for Console.ReadLine, if the task reads input. */
  input?: string[];
  hint: Text2;
  solution: string;
}

export interface CourseLesson {
  id: string;
  icon: string;
  title: Text2;
  goal: Text2;
  /** Two to four short paragraphs. */
  intro: Text2[];
  /** Where you meet this in Unity / Unreal. */
  inGame: Text2;
  lang: 'cs' | 'cpp';
  code: string;
  /** Answers for Console.ReadLine in the example. */
  input?: string[];
  notes: [string, Text2][];
  quiz: Quiz[];
  task?: CourseTask;
}

export interface Course {
  id: 'cs-unity' | 'cs-advanced' | 'unreal';
  icon: string;
  title: Text2;
  about: Text2;
  lessons: CourseLesson[];
}

const T = (en: string, ru: string): Text2 => ({ en, ru });
const N = (m: string, en: string, ru: string): [string, Text2] => [m, { en, ru }];
const Q = (q: Text2, options: (string | Text2)[], answer: number, why: Text2): Quiz => ({ q, options, answer, why });

const CS: CourseLesson[] = [
  {
    id: 'types',
    icon: '📦',
    title: T('Variables and types', 'Переменные и типы'),
    goal: T('Choose int, float, string or bool for a value.', 'Выбирать int, float, string или bool для значения.'),
    intro: [
      T('A variable is a named box. In C# every box has a TYPE: what kind of value fits in it.', 'Переменная — это коробка с именем. В C# у каждой коробки есть ТИП: какое значение в неё помещается.'),
      T('int = whole numbers (lives, coins). float = numbers with a fraction (speed, time) — write the letter f: 2.5f. string = text in quotes. bool = true or false.', 'int — целые числа (жизни, монеты). float — дробные (скорость, время), пиши букву f: 2.5f. string — текст в кавычках. bool — true или false.'),
    ],
    inGame: T('In Unity, public fields with these types appear in the Inspector, so you can tune them without code.', 'В Unity public-поля таких типов появляются в Inspector — их можно настраивать без кода.'),
    lang: 'cs',
    code: `using System;

int lives = 3;
float speed = 4.5f;
string heroName = "Ari";
bool isAlive = true;

lives = lives - 1;
speed = speed * 2;
Console.WriteLine(heroName + " has " + lives + " lives");
Console.WriteLine("Speed: " + speed);
Console.WriteLine("Alive: " + isAlive);`,
    notes: [
      N('int lives = 3;', 'A whole number box called lives.', 'Коробка для целого числа с именем lives.'),
      N('float speed = 4.5f;', 'A fraction number: the f says "this is a float".', 'Дробное число: буква f говорит «это float».'),
      N('lives = lives - 1;', 'Take the old value, subtract 1, put it back.', 'Берём старое значение, вычитаем 1, кладём обратно.'),
      N('Console.WriteLine(heroName', 'Text + number = text: the numbers are glued in.', 'Текст + число = текст: числа приклеиваются.'),
    ],
    quiz: [
      Q(T('Which type fits the player\'s speed 3.7?', 'Какой тип подходит для скорости игрока 3.7?'), ['int', 'float', 'bool', 'string'], 1, T('3.7 has a fraction — float (written 3.7f).', 'У 3.7 есть дробная часть — float (пишется 3.7f).')),
      Q(T('What is lives after: int lives = 3; lives = lives - 1;', 'Чему равно lives после: int lives = 3; lives = lives - 1;'), ['3', '2', '-1', '1'], 1, T('3 - 1 = 2, and the result goes back into lives.', '3 - 1 = 2, и результат снова кладётся в lives.')),
    ],
    task: {
      text: T('Create int coins = 10, add 5 to it and print: Coins: 15', 'Создай int coins = 10, прибавь к нему 5 и выведи: Coins: 15'),
      starter: 'using System;\n\nint coins = 10;\n// add 5 here\n\nConsole.WriteLine("Coins: " + coins);\n',
      expect: ['Coins: 15'],
      hint: T('coins = coins + 5;  or shorter: coins += 5;', 'coins = coins + 5;  или короче: coins += 5;'),
      solution: 'using System;\n\nint coins = 10;\ncoins += 5;\n\nConsole.WriteLine("Coins: " + coins);\n',
    },
  },
  {
    id: 'if',
    icon: '🔀',
    title: T('Decisions: if / else if / else', 'Решения: if / else if / else'),
    goal: T('Make the program choose what to do.', 'Научить программу выбирать, что делать.'),
    intro: [
      T('if checks a condition. If it is true, the block in { } runs. else if checks another condition; else is "otherwise".', 'if проверяет условие. Если оно верно, выполняется блок в { }. else if проверяет другое условие; else — «иначе».'),
      T('Only ONE branch runs — the first whose condition is true.', 'Выполняется только ОДНА ветка — первая, у которой условие верно.'),
    ],
    inGame: T('if (health <= 0) Die(); — the most common line in game code.', 'if (health <= 0) Die(); — самая частая строка в игровом коде.'),
    lang: 'cs',
    code: `using System;

int health = 35;

if (health <= 0)
{
    Console.WriteLine("Game over");
}
else if (health < 50)
{
    Console.WriteLine("Low health! Find a potion");
}
else
{
    Console.WriteLine("All good");
}`,
    notes: [
      N('if (health <= 0)', '<= means "less than or equal". 35 <= 0 is false — skip.', '<= значит «меньше или равно». 35 <= 0 — неверно, пропускаем.'),
      N('else if (health < 50)', '35 < 50 is true — this branch runs.', '35 < 50 — верно, выполняется эта ветка.'),
      N('else', 'Not reached: a branch above already ran.', 'Сюда не дойдём: ветка выше уже выполнилась.'),
    ],
    quiz: [
      Q(T('health = 80. What is printed?', 'health = 80. Что выведется?'), ['Game over', 'Low health! Find a potion', 'All good'], 2, T('80 <= 0 false, 80 < 50 false → else.', '80 <= 0 неверно, 80 < 50 неверно → else.')),
      Q(T('How do you COMPARE two values for equality?', 'Как СРАВНИТЬ два значения на равенство?'), ['=', '==', '=>', '!='], 1, T('== compares; one = puts a value into a box.', '== сравнивает; один = кладёт значение в коробку.')),
    ],
    task: {
      text: T('score = 120. Print "Win!" if score is at least 100, otherwise "Try again".', 'score = 120. Выведи "Win!", если score не меньше 100, иначе "Try again".'),
      starter: 'using System;\n\nint score = 120;\n// write if / else here\n',
      expect: ['Win!'],
      hint: T('if (score >= 100) { Console.WriteLine("Win!"); } else { ... }', 'if (score >= 100) { Console.WriteLine("Win!"); } else { ... }'),
      solution: 'using System;\n\nint score = 120;\nif (score >= 100)\n{\n    Console.WriteLine("Win!");\n}\nelse\n{\n    Console.WriteLine("Try again");\n}\n',
    },
  },
  {
    id: 'for',
    icon: '🔁',
    title: T('Repeat: the for loop', 'Повторение: цикл for'),
    goal: T('Repeat something a counted number of times.', 'Повторять что-то заданное число раз.'),
    intro: [
      T('for (int i = 0; i < 3; i++) means: start i at 0; repeat while i < 3; after each round add 1.', 'for (int i = 0; i < 3; i++) значит: начни i с 0; повторяй, пока i < 3; после каждого круга прибавь 1.'),
      T('So the body runs for i = 0, 1, 2 — three times.', 'Значит, тело выполнится для i = 0, 1, 2 — три раза.'),
    ],
    inGame: T('Spawning a wave of 5 enemies, checking every slot of an inventory.', 'Создать волну из 5 врагов, проверить каждую ячейку инвентаря.'),
    lang: 'cs',
    code: `using System;

int total = 0;
for (int wave = 1; wave <= 3; wave++)
{
    int enemies = wave * 2;
    total += enemies;
    Console.WriteLine("Wave " + wave + ": " + enemies + " enemies");
}
Console.WriteLine("Total: " + total);`,
    notes: [
      N('for (int wave = 1; wave <= 3; wave++)', 'wave goes 1, 2, 3.', 'wave принимает значения 1, 2, 3.'),
      N('total += enemies;', 'Add this wave\'s enemies to the total.', 'Добавляем врагов этой волны к общему числу.'),
    ],
    quiz: [
      Q(T('How many times does for (int i = 0; i < 5; i++) repeat?', 'Сколько раз повторится for (int i = 0; i < 5; i++)?'), ['4', '5', '6'], 1, T('i = 0,1,2,3,4 — five times.', 'i = 0,1,2,3,4 — пять раз.')),
      Q(T('What is the total in the example?', 'Чему равно Total в примере?'), ['6', '12', '9'], 1, T('2 + 4 + 6 = 12.', '2 + 4 + 6 = 12.')),
    ],
    task: {
      text: T('Print the numbers 1 to 5, each on its own line, with a for loop.', 'Выведи числа от 1 до 5, каждое на своей строке, с помощью цикла for.'),
      starter: 'using System;\n\n// your for loop here\n',
      expect: ['1', '2', '3', '4', '5'],
      hint: T('for (int i = 1; i <= 5; i++) Console.WriteLine(i);', 'for (int i = 1; i <= 5; i++) Console.WriteLine(i);'),
      solution: 'using System;\n\nfor (int i = 1; i <= 5; i++)\n{\n    Console.WriteLine(i);\n}\n',
    },
  },
  {
    id: 'while',
    icon: '♾️',
    title: T('while and break', 'while и break'),
    goal: T('Repeat until something happens.', 'Повторять, пока что-то не случится.'),
    intro: [
      T('while (condition) repeats as long as the condition is true. You do not need to know in advance how many times.', 'while (условие) повторяет, пока условие верно. Заранее знать число повторов не нужно.'),
      T('break leaves the loop at once. Careful: if nothing ever makes the condition false, the loop never ends.', 'break сразу выходит из цикла. Осторожно: если ничто не делает условие ложным, цикл не закончится никогда.'),
    ],
    inGame: T('In Unity never write an endless while in Update — Update is already repeated every frame.', 'В Unity никогда не пиши бесконечный while в Update — Update и так повторяется каждый кадр.'),
    lang: 'cs',
    code: `using System;

int secret = 7;
int tries = 0;
while (true)
{
    Console.Write("Guess: ");
    int guess = int.Parse(Console.ReadLine());
    tries++;
    if (guess == secret)
    {
        Console.WriteLine("Yes! Tries: " + tries);
        break;
    }
    Console.WriteLine(guess < secret ? "More" : "Less");
}`,
    input: ['3', '9', '7'],
    notes: [
      N('while (true)', 'Repeat "forever"… until break.', 'Повторять «вечно»… пока не break.'),
      N('int.Parse(Console.ReadLine())', 'Read text and turn it into a number.', 'Читаем текст и превращаем в число.'),
      N('break;', 'Guessed — leave the loop.', 'Угадали — выходим из цикла.'),
      N('guess < secret ? "More" : "Less"', 'A short if: condition ? if-true : if-false.', 'Короткий if: условие ? если-да : если-нет.'),
    ],
    quiz: [
      Q(T('What does break do?', 'Что делает break?'), [T('Stops the whole program', 'Останавливает всю программу'), T('Leaves the current loop', 'Выходит из текущего цикла'), T('Skips one line', 'Пропускает одну строку')], 1, T('break leaves only the loop it is in.', 'break выходит только из цикла, в котором находится.')),
    ],
    task: {
      text: T('Start with energy = 10. While energy > 0, subtract 3 and print energy. (Prints 7, 4, 1, -2)', 'Начни с energy = 10. Пока energy > 0, вычитай 3 и выводи energy. (Выведет 7, 4, 1, -2)'),
      starter: 'using System;\n\nint energy = 10;\n// while loop here\n',
      expect: ['7', '4', '1', '-2'],
      hint: T('while (energy > 0) { energy -= 3; Console.WriteLine(energy); }', 'while (energy > 0) { energy -= 3; Console.WriteLine(energy); }'),
      solution: 'using System;\n\nint energy = 10;\nwhile (energy > 0)\n{\n    energy -= 3;\n    Console.WriteLine(energy);\n}\n',
    },
  },
  {
    id: 'arrays',
    icon: '🗃️',
    title: T('Arrays: a row of boxes', 'Массивы: ряд коробок'),
    goal: T('Keep many values of one kind together.', 'Хранить много значений одного вида вместе.'),
    intro: [
      T('An array is a row of boxes with numbers (indexes). Numbering starts at 0!', 'Массив — это ряд коробок с номерами (индексами). Нумерация с 0!'),
      T('scores.Length tells how many boxes there are. The last index is Length - 1.', 'scores.Length говорит, сколько коробок. Последний номер — Length - 1.'),
    ],
    inGame: T('public Transform[] spawnPoints; — a list of points filled in the Inspector.', 'public Transform[] spawnPoints; — список точек, заполняемый в Inspector.'),
    lang: 'cs',
    code: `using System;

int[] scores = { 40, 75, 90 };
Console.WriteLine("First: " + scores[0]);
Console.WriteLine("Count: " + scores.Length);
scores[1] = 80;

int best = 0;
for (int i = 0; i < scores.Length; i++)
{
    if (scores[i] > best) best = scores[i];
}
Console.WriteLine("Best: " + best);`,
    notes: [
      N('int[] scores = { 40, 75, 90 };', 'Three boxes: [0]=40, [1]=75, [2]=90.', 'Три коробки: [0]=40, [1]=75, [2]=90.'),
      N('scores[1] = 80;', 'Change the second box (index 1).', 'Меняем вторую коробку (номер 1).'),
      N('if (scores[i] > best) best = scores[i];', 'Remember the biggest seen so far.', 'Запоминаем самое большое из увиденных.'),
    ],
    quiz: [
      Q(T('int[] a = { 5, 6, 7 }; What is a[2]?', 'int[] a = { 5, 6, 7 }; Чему равно a[2]?'), ['6', '7', T('error', 'ошибка')], 1, T('Indexes: 0→5, 1→6, 2→7.', 'Номера: 0→5, 1→6, 2→7.')),
      Q(T('What happens with a[3] for that array?', 'Что будет при a[3] для этого массива?'), [T('0', '0'), T('IndexOutOfRangeException', 'IndexOutOfRangeException'), T('7', '7')], 1, T('There is no box number 3 — an error.', 'Коробки с номером 3 нет — ошибка.')),
    ],
    task: {
      text: T('Sum the array { 3, 5, 8 } with a loop and print: Sum: 16', 'Сложи массив { 3, 5, 8 } в цикле и выведи: Sum: 16'),
      starter: 'using System;\n\nint[] values = { 3, 5, 8 };\nint sum = 0;\n// loop here\nConsole.WriteLine("Sum: " + sum);\n',
      expect: ['Sum: 16'],
      hint: T('for (int i = 0; i < values.Length; i++) sum += values[i];', 'for (int i = 0; i < values.Length; i++) sum += values[i];'),
      solution: 'using System;\n\nint[] values = { 3, 5, 8 };\nint sum = 0;\nforeach (int v in values) sum += v;\nConsole.WriteLine("Sum: " + sum);\n',
    },
  },
  {
    id: 'list',
    icon: '🎒',
    title: T('List<T>: an inventory that grows', 'List<T>: инвентарь, который растёт'),
    goal: T('Add, remove and go through items.', 'Добавлять, убирать и перебирать предметы.'),
    intro: [
      T('An array has a fixed size. A List can grow and shrink: Add, Remove, Count.', 'У массива размер фиксирован. List может расти и уменьшаться: Add, Remove, Count.'),
      T('foreach goes through every item without indexes.', 'foreach проходит по каждому элементу без номеров.'),
    ],
    inGame: T('List<GameObject> enemies — enemies alive right now.', 'List<GameObject> enemies — враги, живые прямо сейчас.'),
    lang: 'cs',
    code: `using System;
using System.Collections.Generic;

List<string> bag = new List<string>();
bag.Add("sword");
bag.Add("apple");
bag.Add("key");
bag.Remove("apple");

Console.WriteLine("Items: " + bag.Count);
foreach (string item in bag)
{
    Console.WriteLine("- " + item);
}
Console.WriteLine(bag.Contains("key") ? "Door can open" : "Need a key");`,
    notes: [
      N('using System.Collections.Generic;', 'List lives here.', 'Здесь живёт List.'),
      N('bag.Remove("apple");', 'The apple is eaten.', 'Яблоко съели.'),
      N('foreach (string item in bag)', 'item becomes each element in turn.', 'item по очереди становится каждым элементом.'),
    ],
    quiz: [
      Q(T('After the example, what is bag.Count?', 'Чему равно bag.Count после примера?'), ['3', '2', '1'], 1, T('3 added, 1 removed.', '3 добавили, 1 убрали.')),
    ],
    task: {
      text: T('Make a List<int>, add 4, 6 and 10, then print its Count and the sum: 3 and 20 (two lines).', 'Создай List<int>, добавь 4, 6 и 10, затем выведи Count и сумму: 3 и 20 (две строки).'),
      starter: 'using System;\nusing System.Collections.Generic;\n\nList<int> nums = new List<int>();\n// add and print\n',
      expect: ['3', '20'],
      hint: T('nums.Add(4); … then int sum = 0; foreach (int n in nums) sum += n;', 'nums.Add(4); … затем int sum = 0; foreach (int n in nums) sum += n;'),
      solution: 'using System;\nusing System.Collections.Generic;\n\nList<int> nums = new List<int>();\nnums.Add(4);\nnums.Add(6);\nnums.Add(10);\nint sum = 0;\nforeach (int n in nums) sum += n;\nConsole.WriteLine(nums.Count);\nConsole.WriteLine(sum);\n',
    },
  },
  {
    id: 'methods',
    icon: '🧩',
    title: T('Methods: parameters and return', 'Методы: параметры и return'),
    goal: T('Pack a piece of logic into a reusable method.', 'Упаковать кусок логики в метод, который можно вызывать много раз.'),
    intro: [
      T('A method is a named recipe. Parameters are its ingredients; return gives the result back.', 'Метод — это рецепт с именем. Параметры — его ингредиенты; return отдаёт результат.'),
      T('void means "gives nothing back".', 'void значит «ничего не возвращает».'),
    ],
    inGame: T('TakeDamage(int amount), Heal(int amount), IsGrounded() — game scripts are made of methods.', 'TakeDamage(int amount), Heal(int amount), IsGrounded() — игровые скрипты состоят из методов.'),
    lang: 'cs',
    code: `using System;

int Damage(int attack, int armor)
{
    int result = attack - armor;
    if (result < 1) result = 1;
    return result;
}

void Report(string who, int hp)
{
    Console.WriteLine(who + ": " + hp + " HP");
}

int hp = 20;
hp -= Damage(8, 3);
Report("Hero", hp);
hp -= Damage(2, 5);
Report("Hero", hp);`,
    notes: [
      N('int Damage(int attack, int armor)', 'Gets two numbers, gives back one number.', 'Получает два числа, возвращает одно число.'),
      N('if (result < 1) result = 1;', 'Always at least 1 damage.', 'Урон всегда хотя бы 1.'),
      N('hp -= Damage(8, 3);', 'Call: attack=8, armor=3 → 5. hp becomes 15.', 'Вызов: attack=8, armor=3 → 5. hp станет 15.'),
    ],
    quiz: [
      Q(T('What does Damage(2, 5) return?', 'Что вернёт Damage(2, 5)?'), ['-3', '0', '1'], 2, T('2 - 5 = -3 < 1, so 1.', '2 - 5 = -3 < 1, значит 1.')),
    ],
    task: {
      text: T('Write int Square(int n) that returns n * n, and print Square(7) → 49', 'Напиши int Square(int n), который возвращает n * n, и выведи Square(7) → 49'),
      starter: 'using System;\n\n// write Square here\n\nConsole.WriteLine(Square(7));\n',
      expect: ['49'],
      hint: T('int Square(int n) { return n * n; }', 'int Square(int n) { return n * n; }'),
      solution: 'using System;\n\nint Square(int n)\n{\n    return n * n;\n}\n\nConsole.WriteLine(Square(7));\n',
    },
  },
  {
    id: 'classes',
    icon: '🏗️',
    title: T('Classes and objects', 'Классы и объекты'),
    goal: T('Describe a kind of thing once, make many of them.', 'Описать вид вещи один раз и создавать много таких.'),
    intro: [
      T('A class is a blueprint: which fields (data) and methods (actions) things of this kind have.', 'Класс — это чертёж: какие поля (данные) и методы (действия) есть у вещей этого вида.'),
      T('new makes an object from the blueprint. Each object has its own copy of the fields.', 'new создаёт объект по чертежу. У каждого объекта свои поля.'),
    ],
    inGame: T('Every Unity script is a class. Each enemy in the scene is its own object with its own health.', 'Каждый скрипт Unity — это класс. Каждый враг в сцене — отдельный объект со своим здоровьем.'),
    lang: 'cs',
    code: `using System;

Enemy slime = new Enemy("Slime", 3);
Enemy orc = new Enemy("Orc", 8);
slime.Hit(5);
orc.Hit(5);

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
        if (Health <= 0) Console.WriteLine(Name + " is defeated");
        else Console.WriteLine(Name + " has " + Health + " HP left");
    }
}`,
    notes: [
      N('new Enemy("Slime", 3)', 'A new object: the constructor gets "Slime" and 3.', 'Новый объект: конструктор получает "Slime" и 3.'),
      N('public Enemy(string name, int health)', 'The constructor runs once for each new object.', 'Конструктор выполняется один раз для каждого нового объекта.'),
      N('Health -= damage;', 'Changes THIS object\'s Health only.', 'Меняет Health только ЭТОГО объекта.'),
    ],
    quiz: [
      Q(T('After both hits, which enemy is still alive?', 'Кто из врагов жив после обоих ударов?'), ['Slime', 'Orc', T('both', 'оба')], 1, T('Slime 3-5 ≤ 0; Orc 8-5 = 3.', 'Slime 3-5 ≤ 0; Orc 8-5 = 3.')),
    ],
    task: {
      text: T('Add a method Heal(int amount) to the class Player that adds to Hp, then print p.Hp → 12', 'Добавь в класс Player метод Heal(int amount), который прибавляет к Hp, затем выведи p.Hp → 12'),
      starter: 'using System;\n\nPlayer p = new Player();\np.Heal(2);\nConsole.WriteLine(p.Hp);\n\nclass Player\n{\n    public int Hp = 10;\n    // Heal here\n}\n',
      expect: ['12'],
      hint: T('public void Heal(int amount) { Hp += amount; }', 'public void Heal(int amount) { Hp += amount; }'),
      solution: 'using System;\n\nPlayer p = new Player();\np.Heal(2);\nConsole.WriteLine(p.Hp);\n\nclass Player\n{\n    public int Hp = 10;\n    public void Heal(int amount)\n    {\n        Hp += amount;\n    }\n}\n',
    },
  },
  {
    id: 'properties',
    icon: '🔒',
    title: T('Properties: protected values', 'Свойства: защищённые значения'),
    goal: T('Let others read a value, but change it only through rules.', 'Разрешить читать значение, но менять — только по правилам.'),
    intro: [
      T('public int Hp { get; private set; } — anyone can read Hp, only the class itself can change it.', 'public int Hp { get; private set; } — читать Hp может любой, менять — только сам класс.'),
      T('This protects the rules: health can only go down through TakeDamage, never below 0.', 'Так правила защищены: здоровье уменьшается только через TakeDamage и никогда не ниже 0.'),
    ],
    inGame: T('Common in Unity scripts and in any bigger project.', 'Часто встречается в скриптах Unity и в любом большом проекте.'),
    lang: 'cs',
    code: `using System;

Hero hero = new Hero();
hero.TakeDamage(30);
hero.TakeDamage(90);
Console.WriteLine("HP: " + hero.Hp);
Console.WriteLine(hero.IsDead ? "Dead" : "Alive");

class Hero
{
    public int Hp { get; private set; } = 100;
    public bool IsDead => Hp == 0;

    public void TakeDamage(int amount)
    {
        Hp -= amount;
        if (Hp < 0) Hp = 0;
    }
}`,
    notes: [
      N('{ get; private set; } = 100;', 'Start at 100; outside code can read but not write.', 'Начинаем со 100; снаружи можно читать, но не менять.'),
      N('public bool IsDead => Hp == 0;', 'A computed property: asks every time.', 'Вычисляемое свойство: проверяется каждый раз заново.'),
    ],
    quiz: [
      Q(T('Could another script write hero.Hp = 500; ?', 'Может ли другой скрипт написать hero.Hp = 500; ?'), [T('Yes', 'Да'), T('No, set is private', 'Нет, set — private')], 1, T('private set: only Hero itself can change Hp.', 'private set: менять Hp может только сам Hero.')),
    ],
  },
  {
    id: 'inheritance',
    icon: '👑',
    title: T('Inheritance: virtual and override', 'Наследование: virtual и override'),
    goal: T('Make a special kind of a class that changes some behaviour.', 'Сделать особый вид класса, который меняет часть поведения.'),
    intro: [
      T('class Boss : Enemy — a Boss IS an Enemy: it has everything Enemy has.', 'class Boss : Enemy — Boss ЯВЛЯЕТСЯ Enemy: у него есть всё, что есть у Enemy.'),
      T('virtual says "children may change this method"; override is the child\'s own version.', 'virtual говорит «наследники могут изменить этот метод»; override — своя версия у наследника.'),
    ],
    inGame: T('Player : MonoBehaviour — every Unity script inherits MonoBehaviour!', 'Player : MonoBehaviour — каждый скрипт Unity наследует MonoBehaviour!'),
    lang: 'cs',
    code: `using System;

Enemy[] enemies = { new Enemy(), new Boss() };
foreach (Enemy e in enemies)
{
    e.Attack();
}

class Enemy
{
    public virtual void Attack()
    {
        Console.WriteLine("Enemy hits for 2");
    }
}

class Boss : Enemy
{
    public override void Attack()
    {
        Console.WriteLine("Boss smashes for 10!");
    }
}`,
    notes: [
      N('class Boss : Enemy', 'Boss inherits Enemy.', 'Boss наследует Enemy.'),
      N('public virtual void Attack()', 'May be replaced by children.', 'Наследники могут заменить этот метод.'),
      N('public override void Attack()', 'Boss\'s own attack.', 'Собственная атака Boss.'),
      N('e.Attack();', 'Each object uses ITS version.', 'Каждый объект использует СВОЮ версию.'),
    ],
    quiz: [
      Q(T('What does the second line of output say?', 'Что напишет вторая строка вывода?'), ['Enemy hits for 2', 'Boss smashes for 10!'], 1, T('The second object is a Boss — its override runs.', 'Второй объект — Boss, работает его override.')),
    ],
  },
  {
    id: 'enum-switch',
    icon: '🚦',
    title: T('enum and switch: enemy states', 'enum и switch: состояния врага'),
    goal: T('Name a fixed set of options and choose by them.', 'Назвать набор вариантов и выбирать по ним.'),
    intro: [
      T('enum State { Patrol, Chase, Attack } — a type with exactly these values. No typos possible.', 'enum State { Patrol, Chase, Attack } — тип ровно с этими значениями. Опечатки невозможны.'),
      T('switch picks the case that matches; break ends each case.', 'switch выбирает подходящий case; break завершает каждый case.'),
    ],
    inGame: T('Simple enemy AI is a "state machine" — exactly this.', 'Простой ИИ врага — это «машина состояний», ровно это.'),
    lang: 'cs',
    code: `using System;

State Decide(float distance)
{
    if (distance < 1.5f) return State.Attack;
    if (distance < 6f) return State.Chase;
    return State.Patrol;
}

float[] distances = { 10f, 4f, 1f };
foreach (float d in distances)
{
    switch (Decide(d))
    {
        case State.Patrol:
            Console.WriteLine(d + ": walking around");
            break;
        case State.Chase:
            Console.WriteLine(d + ": running to the player");
            break;
        case State.Attack:
            Console.WriteLine(d + ": attack!");
            break;
    }
}

enum State { Patrol, Chase, Attack }`,
    notes: [
      N('enum State { Patrol, Chase, Attack }', 'Three named options.', 'Три названных варианта.'),
      N('switch (Decide(d))', 'Choose a case by the state.', 'Выбираем case по состоянию.'),
    ],
    quiz: [
      Q(T('distance = 5. Which state?', 'distance = 5. Какое состояние?'), ['Patrol', 'Chase', 'Attack'], 1, T('5 is not < 1.5, but is < 6 → Chase.', '5 не меньше 1.5, но меньше 6 → Chase.')),
    ],
  },
  {
    id: 'dictionary',
    icon: '📒',
    title: T('Dictionary: key → value', 'Dictionary: ключ → значение'),
    goal: T('Find a value by its name.', 'Находить значение по имени.'),
    intro: [
      T('Dictionary<string, int> prices — "sword" → 50, "potion" → 10. Look up by key: prices["sword"].', 'Dictionary<string, int> prices — "sword" → 50, "potion" → 10. Поиск по ключу: prices["sword"].'),
      T('Check ContainsKey before reading a key that may be missing.', 'Проверяй ContainsKey перед чтением ключа, которого может не быть.'),
    ],
    inGame: T('Shop prices, saved settings, item counts in an inventory.', 'Цены в магазине, сохранённые настройки, количество предметов в инвентаре.'),
    lang: 'cs',
    code: `using System;
using System.Collections.Generic;

Dictionary<string, int> prices = new Dictionary<string, int>();
prices["sword"] = 50;
prices["potion"] = 10;
prices["potion"] += 5;

int gold = 60;
string want = "sword";
if (prices.ContainsKey(want) && gold >= prices[want])
{
    gold -= prices[want];
    Console.WriteLine("Bought " + want + ", gold left: " + gold);
}
Console.WriteLine("Potion costs " + prices["potion"]);`,
    notes: [
      N('prices["sword"] = 50;', 'Put a value under a key.', 'Кладём значение под ключ.'),
      N('prices.ContainsKey(want)', 'Is there such a key?', 'Есть ли такой ключ?'),
    ],
    quiz: [
      Q(T('How much does the potion cost at the end?', 'Сколько стоит зелье в конце?'), ['10', '15', '5'], 1, T('10 + 5 = 15.', '10 + 5 = 15.')),
    ],
    task: {
      text: T('Make Dictionary<string, int> ammo with "pistol" = 12, then subtract 2 and print: 10', 'Создай Dictionary<string, int> ammo с "pistol" = 12, затем вычти 2 и выведи: 10'),
      starter: 'using System;\nusing System.Collections.Generic;\n\n// your code\n',
      expect: ['10'],
      hint: T('var ammo = new Dictionary<string, int>(); ammo["pistol"] = 12; ammo["pistol"] -= 2;', 'var ammo = new Dictionary<string, int>(); ammo["pistol"] = 12; ammo["pistol"] -= 2;'),
      solution: 'using System;\nusing System.Collections.Generic;\n\nvar ammo = new Dictionary<string, int>();\nammo["pistol"] = 12;\nammo["pistol"] -= 2;\nConsole.WriteLine(ammo["pistol"]);\n',
    },
  },
  {
    id: 'strings',
    icon: '💬',
    title: T('Text: interpolation $"…"', 'Текст: интерполяция $"…"'),
    goal: T('Build UI texts nicely.', 'Красиво собирать тексты для интерфейса.'),
    intro: [
      T('$"Score: {score}" puts the value of score inside the text. Easier than + + +.', '$"Score: {score}" вставляет значение score прямо в текст. Проще, чем + + +.'),
      T('{time:F1} shows one digit after the point.', '{time:F1} показывает одну цифру после точки.'),
    ],
    inGame: T('scoreText.text = $"Coins: {coins}"; — UI in Unity.', 'scoreText.text = $"Coins: {coins}"; — интерфейс в Unity.'),
    lang: 'cs',
    code: `using System;

string player = "Ari";
int coins = 7;
float time = 12.345f;

Console.WriteLine($"{player} has {coins} coins");
Console.WriteLine($"Time: {time:F1} s");
Console.WriteLine($"Next level at {coins * 2} coins");
Console.WriteLine(player.ToUpper() + " WINS");`,
    notes: [
      N('$"{player} has {coins} coins"', 'Values in { } go into the text.', 'Значения в { } попадают в текст.'),
      N('{time:F1}', 'Format: 1 digit after the point → 12.3.', 'Формат: 1 цифра после точки → 12.3.'),
    ],
    quiz: [
      Q(T('$"{2 + 3}" gives…', '$"{2 + 3}" даёт…'), ['"2 + 3"', '"5"', '"23"'], 1, T('The expression in { } is calculated.', 'Выражение в { } вычисляется.')),
    ],
    task: {
      text: T('With int lives = 3, print exactly: Lives: 3/5 (use $"…")', 'При int lives = 3 выведи ровно: Lives: 3/5 (используй $"…")'),
      starter: 'using System;\n\nint lives = 3;\n',
      expect: ['Lives: 3/5'],
      hint: T('Console.WriteLine($"Lives: {lives}/5");', 'Console.WriteLine($"Lives: {lives}/5");'),
      solution: 'using System;\n\nint lives = 3;\nConsole.WriteLine($"Lives: {lives}/5");\n',
    },
  },
  {
    id: 'linq',
    icon: '🔎',
    title: T('LINQ: ask questions about lists', 'LINQ: задавать вопросы спискам'),
    goal: T('Filter and count lists in one line.', 'Фильтровать и считать списки одной строкой.'),
    intro: [
      T('Where keeps the items that fit a condition; Select turns each item into something; Count, Sum, Max answer questions.', 'Where оставляет подходящие элементы; Select превращает каждый элемент во что-то; Count, Sum, Max отвечают на вопросы.'),
      T('x => x > 50 is a tiny function: "take x, answer whether x > 50".', 'x => x > 50 — маленькая функция: «возьми x и ответь, больше ли он 50».'),
    ],
    inGame: T('enemies.Where(e => e.Health > 0).Count() — how many are alive.', 'enemies.Where(e => e.Health > 0).Count() — сколько живых.'),
    lang: 'cs',
    code: `using System;
using System.Collections.Generic;
using System.Linq;

List<int> damage = new List<int> { 12, 55, 7, 80, 31 };
var big = damage.Where(d => d > 30).ToList();
Console.WriteLine("Big hits: " + big.Count);
Console.WriteLine("Total: " + damage.Sum());
Console.WriteLine("Max: " + damage.Max());
Console.WriteLine(string.Join(", ", damage.Select(d => d * 2)));`,
    notes: [
      N('damage.Where(d => d > 30)', 'Keep only hits over 30: 55, 80, 31.', 'Оставляем удары больше 30: 55, 80, 31.'),
      N('damage.Select(d => d * 2)', 'Each value doubled.', 'Каждое значение удвоено.'),
    ],
    quiz: [
      Q(T('What is damage.Max()?', 'Чему равно damage.Max()?'), ['55', '80', '185'], 1, T('The biggest value is 80.', 'Самое большое значение — 80.')),
    ],
  },
  {
    id: 'try',
    icon: '🛟',
    title: T('try / catch: survive errors', 'try / catch: пережить ошибку'),
    goal: T('Handle a possible error instead of crashing.', 'Обработать возможную ошибку вместо падения.'),
    intro: [
      T('Some actions can fail: int.Parse("abc") cannot make a number. Without protection the program stops.', 'Некоторые действия могут не получиться: int.Parse("abc") не сделает число. Без защиты программа остановится.'),
      T('try { … } catch { … } — if something inside try fails, catch runs instead and the program continues.', 'try { … } catch { … } — если внутри try что-то сломалось, выполняется catch, и программа продолжает работу.'),
    ],
    inGame: T('Reading save files, parsing input fields in menus.', 'Чтение сохранений, разбор полей ввода в меню.'),
    lang: 'cs',
    code: `using System;

string[] inputs = { "42", "abc", "7" };
foreach (string text in inputs)
{
    try
    {
        int n = int.Parse(text);
        Console.WriteLine("Number: " + n);
    }
    catch (FormatException)
    {
        Console.WriteLine("'" + text + "' is not a number");
    }
}`,
    notes: [N('int n = int.Parse(text);', 'May fail for "abc".', 'Может сломаться на "abc".'), N('catch (FormatException)', 'Runs only if the text was not a number.', 'Выполняется, только если текст не был числом.')],
    quiz: [
      Q(T('How many lines say "Number:"?', 'Сколько строк начинается с "Number:"?'), ['1', '2', '3'], 1, T('"42" and "7" are numbers.', '"42" и "7" — числа.')),
    ],
  },
  {
    id: 'vectors',
    icon: '🧭',
    title: T('Vectors: positions and directions', 'Векторы: положение и направление'),
    goal: T('Understand Vector3 — the most used type in Unity.', 'Понять Vector3 — самый частый тип в Unity.'),
    intro: [
      T('Vector3(x, y, z) is three numbers: a point in the world or a direction with a length.', 'Vector3(x, y, z) — три числа: точка в мире или направление с длиной.'),
      T('Adding a direction to a position moves it. Vector3.Distance tells how far two points are.', 'Если прибавить направление к положению — объект сдвинется. Vector3.Distance говорит, как далеко две точки.'),
    ],
    inGame: T('transform.position, Vector3.up, MoveTowards, Distance to the player…', 'transform.position, Vector3.up, MoveTowards, Distance до игрока…'),
    lang: 'cs',
    code: `using System;
using UnityEngine;

Vector3 position = new Vector3(0, 0, 0);
Vector3 step = new Vector3(1, 0, 0);
for (int i = 0; i < 3; i++)
{
    position += step;
}
Console.WriteLine("Position: " + position);
Vector3 enemy = new Vector3(3, 4, 0);
Console.WriteLine("Distance: " + Vector3.Distance(Vector3.zero, enemy));
Console.WriteLine("Up: " + Vector3.up);`,
    notes: [
      N('position += step;', 'Move one unit to the right each time.', 'Каждый раз сдвигаемся на одну единицу вправо.'),
      N('Vector3.Distance(Vector3.zero, enemy)', 'From (0,0,0) to (3,4,0) is 5 (Pythagoras).', 'От (0,0,0) до (3,4,0) — 5 (теорема Пифагора).'),
    ],
    quiz: [
      Q(T('What is Vector3.up?', 'Что такое Vector3.up?'), ['(1, 0, 0)', '(0, 1, 0)', '(0, 0, 1)'], 1, T('Up is +Y.', 'Вверх — это +Y.')),
    ],
  },
];

const UE: CourseLesson[] = [
  {
    id: 'ue-actor',
    icon: '🎬',
    title: T('Unreal: Actor, BeginPlay and Tick', 'Unreal: Actor, BeginPlay и Tick'),
    goal: T('Read a basic Unreal C++ Actor.', 'Читать простой Actor на C++ в Unreal.'),
    intro: [
      T('In Unreal, an Actor is anything placed in a level (like a GameObject with a script in Unity).', 'В Unreal Actor — это всё, что стоит на уровне (как GameObject со скриптом в Unity).'),
      T('BeginPlay = Start (once), Tick(DeltaTime) = Update (every frame). DeltaTime = Time.deltaTime.', 'BeginPlay = Start (один раз), Tick(DeltaTime) = Update (каждый кадр). DeltaTime = Time.deltaTime.'),
      T('C++ cannot be run inside this app — read it with the explanations and test it in Unreal.', 'C++ нельзя запустить внутри этой программы — читай с объяснениями и проверяй в Unreal.'),
    ],
    inGame: T('Every gameplay class in Unreal C++ looks like this.', 'Любой игровой класс на C++ в Unreal выглядит так.'),
    lang: 'cpp',
    code: `#include "Spinner.h"

ASpinner::ASpinner()
{
    PrimaryActorTick.bCanEverTick = true;
}

void ASpinner::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Warning, TEXT("Spinner started"));
}

void ASpinner::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    AddActorLocalRotation(FRotator(0.f, Speed * DeltaTime, 0.f));
}`,
    notes: [
      N('ASpinner::ASpinner()', 'The constructor. "A" in front means an Actor class.', 'Конструктор. Буква «A» в начале — признак класса Actor.'),
      N('bCanEverTick = true', 'Without this Tick is never called.', 'Без этого Tick никогда не вызывается.'),
      N('Super::BeginPlay();', 'Let the parent do its part first — always keep this line.', 'Сначала родитель делает своё — эту строку всегда оставляй.'),
      N('UE_LOG', 'Like Debug.Log: writes to the Output Log.', 'Как Debug.Log: пишет в Output Log.'),
      N('AddActorLocalRotation', 'Turn a bit every frame; DeltaTime keeps the speed equal on every PC.', 'Поворачиваем понемногу каждый кадр; DeltaTime делает скорость одинаковой на любом ПК.'),
    ],
    quiz: [
      Q(T('Which Unity method is like Tick?', 'Какой метод Unity похож на Tick?'), ['Start', 'Update', 'Awake'], 1, T('Both run every frame.', 'Оба выполняются каждый кадр.')),
      Q(T('What does :: mean in ASpinner::Tick?', 'Что значит :: в ASpinner::Tick?'), [T('Tick belongs to the class ASpinner', 'Tick принадлежит классу ASpinner'), T('Division', 'Деление'), T('A comment', 'Комментарий')], 0, T(':: names the class the method belongs to.', ':: указывает класс, которому принадлежит метод.')),
    ],
  },
  {
    id: 'ue-uproperty',
    icon: '🏷️',
    title: T('Unreal: UPROPERTY and the header (.h)', 'Unreal: UPROPERTY и заголовок (.h)'),
    goal: T('See how variables appear in the Unreal editor.', 'Понять, как переменные появляются в редакторе Unreal.'),
    intro: [
      T('In C++ a class is usually split: the .h file DECLARES (what exists), the .cpp file DEFINES (what it does).', 'В C++ класс обычно делят: .h файл ОБЪЯВЛЯЕТ (что есть), .cpp файл ОПРЕДЕЛЯЕТ (что делает).'),
      T('UPROPERTY(EditAnywhere) is like public in Unity: the value can be tuned in the Details panel.', 'UPROPERTY(EditAnywhere) — как public в Unity: значение можно настраивать в панели Details.'),
    ],
    inGame: T('Speed, health, damage — any number you want to tune without recompiling.', 'Скорость, здоровье, урон — любое число, которое хочется настраивать без перекомпиляции.'),
    lang: 'cpp',
    code: `#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Spinner.generated.h"

UCLASS()
class ASpinner : public AActor
{
    GENERATED_BODY()

public:
    ASpinner();
    virtual void Tick(float DeltaTime) override;

    UPROPERTY(EditAnywhere, Category = "Spinner")
    float Speed = 90.f;

protected:
    virtual void BeginPlay() override;
};`,
    notes: [
      N('#pragma once', 'Include this file only once.', 'Подключать этот файл только один раз.'),
      N('UCLASS()', 'Makes the class known to Unreal (editor, Blueprints).', 'Делает класс известным Unreal (редактор, Blueprints).'),
      N('class ASpinner : public AActor', 'ASpinner inherits AActor (like : MonoBehaviour).', 'ASpinner наследует AActor (как : MonoBehaviour).'),
      N('GENERATED_BODY()', 'Code that Unreal writes for you. Always keep it.', 'Код, который Unreal пишет за тебя. Всегда оставляй.'),
      N('UPROPERTY(EditAnywhere', 'Visible and editable in the Details panel.', 'Видно и можно менять в панели Details.'),
      N('};', 'In C++ a class ends with }; — the ; is required!', 'В C++ класс заканчивается на }; — точка с запятой обязательна!'),
    ],
    quiz: [
      Q(T('Where is the class DECLARED?', 'Где класс ОБЪЯВЛЯЕТСЯ?'), ['.h', '.cpp', '.uasset'], 0, T('The header lists what exists; the .cpp says what it does.', 'Заголовок перечисляет, что есть; .cpp — что оно делает.')),
    ],
  },
  {
    id: 'ue-pointers',
    icon: '👉',
    title: T('Unreal: pointers and IsValid', 'Unreal: указатели и IsValid'),
    goal: T('Understand * and -> and avoid crashes.', 'Понять * и -> и избегать вылетов.'),
    intro: [
      T('AActor* Target is a POINTER: not the actor itself, but its address. It may be nullptr (points to nothing).', 'AActor* Target — это УКАЗАТЕЛЬ: не сам актор, а его адрес. Он может быть nullptr (указывает в никуда).'),
      T('-> calls something through a pointer. Using a null pointer crashes the game — check with IsValid first (like != null in Unity).', '-> вызывает что-то через указатель. Пустой указатель роняет игру — сначала проверь IsValid (как != null в Unity).'),
    ],
    inGame: T('References to other actors, components, the player pawn.', 'Ссылки на других акторов, компоненты, пешку игрока.'),
    lang: 'cpp',
    code: `void AGuard::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    if (!IsValid(Target))
    {
        return;
    }
    FVector ToTarget = Target->GetActorLocation() - GetActorLocation();
    if (ToTarget.Size() < 600.f)
    {
        UE_LOG(LogTemp, Warning, TEXT("I see you!"));
    }
}`,
    notes: [
      N('if (!IsValid(Target))', 'No target (or destroyed)? Then do nothing.', 'Нет цели (или уничтожена)? Тогда ничего не делаем.'),
      N('Target->GetActorLocation()', '-> = "go to the object at this address and ask its location".', '-> = «перейди к объекту по этому адресу и спроси его положение».'),
      N('ToTarget.Size()', 'Length of the vector = distance.', 'Длина вектора = расстояние.'),
    ],
    quiz: [
      Q(T('What happens if Target is nullptr and you call Target->GetActorLocation() without a check?', 'Что будет, если Target = nullptr и вызвать Target->GetActorLocation() без проверки?'), [T('Returns 0', 'Вернёт 0'), T('The game crashes', 'Игра вылетит'), T('Nothing', 'Ничего')], 1, T('Access through a null pointer is a crash (access violation).', 'Обращение через пустой указатель — вылет (access violation).')),
    ],
  },
  {
    id: 'ue-input',
    icon: '🎮',
    title: T('Unreal: functions for Blueprints', 'Unreal: функции для Blueprints'),
    goal: T('Make C++ functions callable from Blueprints.', 'Сделать функции C++ доступными из Blueprints.'),
    intro: [
      T('UFUNCTION(BlueprintCallable) lets a Blueprint graph call your C++ function — the usual way to mix C++ and Blueprints.', 'UFUNCTION(BlueprintCallable) позволяет вызывать твою C++-функцию из Blueprint — обычный способ сочетать C++ и Blueprints.'),
      T('FMath::Clamp keeps a value between limits (like Mathf.Clamp).', 'FMath::Clamp держит значение в пределах (как Mathf.Clamp).'),
    ],
    inGame: T('Health systems written in C++, used by designers in Blueprints.', 'Системы здоровья, написанные на C++ и используемые дизайнерами в Blueprints.'),
    lang: 'cpp',
    code: `UFUNCTION(BlueprintCallable, Category = "Health")
void ApplyDamage(float Amount);

void AHero::ApplyDamage(float Amount)
{
    Health = FMath::Clamp(Health - Amount, 0.f, MaxHealth);
    if (Health <= 0.f)
    {
        Destroy();
    }
}`,
    notes: [
      N('UFUNCTION(BlueprintCallable', 'A Blueprint node will appear for this function.', 'Для этой функции появится узел в Blueprint.'),
      N('FMath::Clamp', 'Never below 0, never above MaxHealth.', 'Никогда ниже 0 и выше MaxHealth.'),
      N('Destroy();', 'Remove this actor from the level.', 'Убрать этого актора с уровня.'),
    ],
    quiz: [
      Q(T('What is the Unity equivalent of Destroy() here?', 'Что в Unity соответствует Destroy() здесь?'), ['Destroy(gameObject)', 'SetActive(true)', 'Instantiate()'], 0, T('Both remove the object from the world.', 'Оба убирают объект из мира.')),
    ],
  },
];

const ADV: CourseLesson[] = [
  {
    id: 'static',
    icon: '🏛️',
    title: T('static: one for everybody', 'static: одно на всех'),
    goal: T('Share a value between all objects (a game manager, a total score).', 'Делить одно значение между всеми объектами (менеджер игры, общий счёт).'),
    intro: [
      T('A normal field belongs to EACH object: every enemy has its own health. A static field belongs to the CLASS: there is only one, shared by everybody.', 'Обычное поле есть у КАЖДОГО объекта: у каждого врага своё здоровье. Поле static принадлежит КЛАССУ: оно одно на всех.'),
      T('You use it through the class name: Game.Score, Game.AddScore(5) — no object needed.', 'К нему обращаются через имя класса: Game.Score, Game.AddScore(5) — объект не нужен.'),
    ],
    inGame: T('GameManager.Instance, a total score, settings. But careful: too many statics make code hard to change.', 'GameManager.Instance, общий счёт, настройки. Но осторожно: если всё делать static, код трудно менять.'),
    lang: 'cs',
    code: `using System;

Enemy a = new Enemy();
Enemy b = new Enemy();
a.Hit();
b.Hit();
b.Hit();
Console.WriteLine("Enemies created: " + Enemy.Count);
Console.WriteLine("Hits a: " + a.Hits + ", b: " + b.Hits);

class Enemy
{
    public static int Count = 0;
    public int Hits = 0;

    public Enemy()
    {
        Count++;
    }

    public void Hit()
    {
        Hits++;
    }
}`,
    notes: [
      N('public static int Count = 0;', 'One counter for the whole class.', 'Один счётчик на весь класс.'),
      N('public int Hits = 0;', 'Each enemy has its own Hits.', 'У каждого врага свои Hits.'),
      N('Enemy.Count', 'Read through the class name, not through an object.', 'Читаем через имя класса, а не через объект.'),
    ],
    quiz: [
      Q(T('3 enemies are created. What is Enemy.Count?', 'Создано 3 врага. Чему равно Enemy.Count?'), ['1', '3', T('each has its own', 'у каждого своё')], 1, T('A static field is shared: every constructor adds to the same counter.', 'static-поле общее: каждый конструктор прибавляет к одному и тому же счётчику.')),
    ],
    task: {
      text: T('Make Score.Total static, call Score.Add(5) twice and print 10.', 'Сделай Score.Total статическим, вызови Score.Add(5) два раза и выведи 10.'),
      starter: 'using System;\n\nScore.Add(5);\nScore.Add(5);\nConsole.WriteLine(Score.Total);\n\nclass Score\n{\n    // make Total and Add static\n}\n',
      expect: ['10'],
      hint: T('public static int Total; public static void Add(int n) { Total += n; }', 'public static int Total; public static void Add(int n) { Total += n; }'),
      solution: 'using System;\n\nScore.Add(5);\nScore.Add(5);\nConsole.WriteLine(Score.Total);\n\nclass Score\n{\n    public static int Total;\n\n    public static void Add(int n)\n    {\n        Total += n;\n    }\n}\n',
    },
  },
  {
    id: 'struct-class',
    icon: '📋',
    title: T('struct and class: copy or the same thing?', 'struct и class: копия или то же самое?'),
    goal: T('Understand why Vector3 behaves differently from a GameObject.', 'Понять, почему Vector3 ведёт себя не так, как GameObject.'),
    intro: [
      T('A class variable holds a LINK to an object: two variables can point to the same object, changing one changes "both".', 'Переменная-класс хранит ССЫЛКУ на объект: две переменные могут указывать на один объект — изменишь через одну, изменится «у обеих».'),
      T('A struct is a VALUE: b = a makes a full copy. Vector3, Vector2, Quaternion and Color are structs — that is why transform.position.x = 5 is not allowed (CS1612): you would change a copy.', 'struct — это ЗНАЧЕНИЕ: b = a делает полную копию. Vector3, Vector2, Quaternion и Color — структуры. Поэтому transform.position.x = 5 нельзя (CS1612): ты изменил бы копию.'),
    ],
    inGame: T('Vector3 p = transform.position; p.y += 1; transform.position = p; — copy, change, put back.', 'Vector3 p = transform.position; p.y += 1; transform.position = p; — скопировать, изменить, положить обратно.'),
    lang: 'cs',
    code: `using System;

Point a = new Point(1, 2);
Point b = a;
b.X = 10;
Console.WriteLine("struct: a.X = " + a.X + ", b.X = " + b.X);

Box c = new Box();
Box d = c;
d.X = 10;
Console.WriteLine("class: c.X = " + c.X + ", d.X = " + d.X);

struct Point
{
    public int X;
    public int Y;
    public Point(int x, int y) { X = x; Y = y; }
}

class Box
{
    public int X;
}`,
    notes: [
      N('Point b = a;', 'struct: b is a separate copy.', 'struct: b — отдельная копия.'),
      N('Box d = c;', 'class: d and c are two names for ONE box.', 'class: d и c — два имени ОДНОЙ коробки.'),
    ],
    quiz: [
      Q(T('Vector3 is a…', 'Vector3 — это…'), ['struct', 'class'], 0, T('A value type: copied on every assignment.', 'Тип-значение: копируется при каждом присваивании.')),
      Q(T('Why is transform.position.x = 5 an error?', 'Почему transform.position.x = 5 — ошибка?'), [T('position is a copy of a struct', 'position — копия структуры'), T('x is private', 'x — private'), T('5 needs f', '5 нужна f')], 0, T('You would change only the copy, so C# forbids it.', 'Ты изменил бы только копию, поэтому C# запрещает.')),
    ],
    task: {
      text: T('Copy the struct, change the copy\'s Y to 7 and print both: 2 and 7 (two lines).', 'Скопируй структуру, измени у копии Y на 7 и выведи обе: 2 и 7 (две строки).'),
      starter: 'using System;\n\nPoint a = new Point(1, 2);\n// make b a copy of a, set b.Y = 7, print a.Y and b.Y\n\nstruct Point\n{\n    public int X;\n    public int Y;\n    public Point(int x, int y) { X = x; Y = y; }\n}\n',
      expect: ['2', '7'],
      hint: T('Point b = a; b.Y = 7; Console.WriteLine(a.Y); Console.WriteLine(b.Y);', 'Point b = a; b.Y = 7; Console.WriteLine(a.Y); Console.WriteLine(b.Y);'),
      solution: 'using System;\n\nPoint a = new Point(1, 2);\nPoint b = a;\nb.Y = 7;\nConsole.WriteLine(a.Y);\nConsole.WriteLine(b.Y);\n\nstruct Point\n{\n    public int X;\n    public int Y;\n    public Point(int x, int y) { X = x; Y = y; }\n}\n',
    },
  },
  {
    id: 'interface',
    icon: '🔌',
    title: T('Interfaces: "can take damage"', 'Интерфейсы: «умеет получать урон»'),
    goal: T('Treat different things the same way through an interface.', 'Обращаться с разными вещами одинаково через интерфейс.'),
    intro: [
      T('An interface is a promise: "every class that implements IDamageable HAS a TakeDamage method". It contains no code itself.', 'Интерфейс — это обещание: «у каждого класса, который реализует IDamageable, ЕСТЬ метод TakeDamage». Своего кода в нём нет.'),
      T('A bullet does not care whether it hit a box, an enemy or a barrel — it just calls TakeDamage.', 'Пуле всё равно, во что она попала — в ящик, врага или бочку, — она просто вызывает TakeDamage.'),
    ],
    inGame: T('other.GetComponent<IDamageable>()?.TakeDamage(1); — one line for every destructible thing.', 'other.GetComponent<IDamageable>()?.TakeDamage(1); — одна строка для всего, что можно разрушить.'),
    lang: 'cs',
    code: `using System;

IDamageable[] targets = { new Crate(), new Enemy(), new Enemy() };
foreach (IDamageable t in targets)
{
    t.TakeDamage(4);
}

interface IDamageable
{
    void TakeDamage(int amount);
}

class Crate : IDamageable
{
    public void TakeDamage(int amount)
    {
        Console.WriteLine("The crate breaks!");
    }
}

class Enemy : IDamageable
{
    int health = 6;
    public void TakeDamage(int amount)
    {
        health -= amount;
        Console.WriteLine("Enemy health: " + health);
    }
}`,
    notes: [
      N('interface IDamageable', 'Names start with I by tradition.', 'Имена по традиции начинаются с I.'),
      N('class Crate : IDamageable', 'Crate promises to have TakeDamage.', 'Crate обещает, что у него есть TakeDamage.'),
      N('t.TakeDamage(4);', 'Works for every kind of target.', 'Работает для любого вида цели.'),
    ],
    quiz: [
      Q(T('Does an interface contain the code of TakeDamage?', 'Есть ли в интерфейсе код метода TakeDamage?'), [T('No, only the promise', 'Нет, только обещание'), T('Yes', 'Да')], 0, T('Each class writes its own version.', 'Каждый класс пишет свою версию.')),
    ],
    task: {
      text: T('Add a class Barrel : IDamageable that prints "Boom!", and damage it.', 'Добавь класс Barrel : IDamageable, который выводит "Boom!", и нанеси ему урон.'),
      starter: 'using System;\n\nIDamageable b = new Barrel();\nb.TakeDamage(1);\n\ninterface IDamageable\n{\n    void TakeDamage(int amount);\n}\n\n// write class Barrel here\n',
      expect: ['Boom!'],
      hint: T('class Barrel : IDamageable { public void TakeDamage(int amount) { Console.WriteLine("Boom!"); } }', 'class Barrel : IDamageable { public void TakeDamage(int amount) { Console.WriteLine("Boom!"); } }'),
      solution: 'using System;\n\nIDamageable b = new Barrel();\nb.TakeDamage(1);\n\ninterface IDamageable\n{\n    void TakeDamage(int amount);\n}\n\nclass Barrel : IDamageable\n{\n    public void TakeDamage(int amount)\n    {\n        Console.WriteLine("Boom!");\n    }\n}\n',
    },
  },
  {
    id: 'delegates',
    icon: '📨',
    title: T('Action and Func: code in a variable', 'Action и Func: код в переменной'),
    goal: T('Store a piece of code and call it later; subscribe several handlers.', 'Хранить кусок кода и вызывать его позже; подписывать несколько обработчиков.'),
    intro: [
      T('Action<int> is a variable that holds a METHOD taking an int. Func<int, int, int> holds a method that also returns a result.', 'Action<int> — переменная, в которой лежит МЕТОД, принимающий int. Func<int, int, int> — метод, который ещё и возвращает результат.'),
      T('+= adds one more handler: when you call it, ALL handlers run in order. ?.Invoke(…) calls it only if somebody subscribed.', '+= добавляет ещё один обработчик: при вызове выполняются ВСЕ по порядку. ?.Invoke(…) вызывает, только если кто-то подписан.'),
    ],
    inGame: T('Button.onClick, callbacks after an animation, "when health changes → update the bar and play a sound".', 'Button.onClick, обратные вызовы после анимации, «когда здоровье меняется → обнови полоску и проиграй звук».'),
    lang: 'cs',
    code: `using System;

Action<int> onScore = null;
onScore += (points) => Console.WriteLine("UI shows " + points);
onScore += (points) => Console.WriteLine("Ding!");
onScore?.Invoke(10);

Func<int, int, int> damage = (attack, armor) => Math.Max(1, attack - armor);
Console.WriteLine("Damage: " + damage(7, 3));`,
    notes: [
      N('Action<int> onScore = null;', 'Nobody is subscribed yet.', 'Пока никто не подписан.'),
      N('onScore += (points) =>', 'Subscribe a handler (a small anonymous method).', 'Подписываем обработчик (маленький безымянный метод).'),
      N('onScore?.Invoke(10);', 'Call every handler with 10.', 'Вызываем каждый обработчик с 10.'),
      N('Func<int, int, int>', 'Two int inputs, an int result.', 'Два int на входе, int на выходе.'),
    ],
    quiz: [
      Q(T('How many lines does onScore?.Invoke(10) print here?', 'Сколько строк выведет здесь onScore?.Invoke(10)?'), ['1', '2', '0'], 1, T('Two handlers are subscribed; both run.', 'Подписаны два обработчика — выполняются оба.')),
    ],
    task: {
      text: T('Make a Func<int, int> square that returns n * n and print square(6) → 36.', 'Создай Func<int, int> square, который возвращает n * n, и выведи square(6) → 36.'),
      starter: 'using System;\n\n// Func<int, int> square = …\n',
      expect: ['36'],
      hint: T('Func<int, int> square = n => n * n; Console.WriteLine(square(6));', 'Func<int, int> square = n => n * n; Console.WriteLine(square(6));'),
      solution: 'using System;\n\nFunc<int, int> square = n => n * n;\nConsole.WriteLine(square(6));\n',
    },
  },
  {
    id: 'events',
    icon: '📣',
    title: T('Events: "tell everybody who cares"', 'События: «сообщи всем, кому интересно»'),
    goal: T('Let a class announce something without knowing who listens.', 'Дать классу сообщить о чём-то, не зная, кто его слушает.'),
    intro: [
      T('public event Action Died; is a list of subscribers. The Player only says Died?.Invoke() — the UI, the sound and the score subscribe themselves.', 'public event Action Died; — список подписчиков. Игрок только говорит Died?.Invoke(), а интерфейс, звук и счёт подписываются сами.'),
      T('So the Player does not need to know about the UI at all. This is the "observer" pattern — one of the most useful ideas in game code.', 'Значит, игроку вообще не нужно знать про интерфейс. Это шаблон «наблюдатель» — одна из самых полезных идей в игровом коде.'),
    ],
    inGame: T('In Unity: subscribe in OnEnable (player.Died += ShowGameOver;), unsubscribe in OnDisable (-=).', 'В Unity: подписка в OnEnable (player.Died += ShowGameOver;), отписка в OnDisable (-=).'),
    lang: 'cs',
    code: `using System;

Player player = new Player();
player.HealthChanged += (hp) => Console.WriteLine("Health bar: " + hp);
player.Died += () => Console.WriteLine("GAME OVER screen");
player.Hit(3);
player.Hit(3);

class Player
{
    public event Action<int> HealthChanged;
    public event Action Died;
    int health = 5;

    public void Hit(int damage)
    {
        health -= damage;
        HealthChanged?.Invoke(health);
        if (health <= 0)
        {
            Died?.Invoke();
        }
    }
}`,
    notes: [
      N('public event Action<int> HealthChanged;', 'An event that sends the new health.', 'Событие, которое передаёт новое здоровье.'),
      N('HealthChanged?.Invoke(health);', 'Tell all subscribers (if any).', 'Сообщаем всем подписчикам (если они есть).'),
      N('player.Died += ', 'The outside world subscribes.', 'Внешний мир подписывается.'),
    ],
    quiz: [
      Q(T('Does Player know that a "GAME OVER screen" exists?', 'Знает ли Player, что существует «экран GAME OVER»?'), [T('No — it only raises the event', 'Нет — он только вызывает событие'), T('Yes', 'Да')], 0, T('That is the point: less coupling, easier changes.', 'В этом и смысл: меньше связей, проще изменения.')),
    ],
    task: {
      text: T('Subscribe to Coin.Collected so that collecting prints "+1 coin".', 'Подпишись на Coin.Collected так, чтобы при сборе выводилось "+1 coin".'),
      starter: 'using System;\n\nCoin coin = new Coin();\n// subscribe here\ncoin.Collect();\n\nclass Coin\n{\n    public event Action Collected;\n    public void Collect() { Collected?.Invoke(); }\n}\n',
      expect: ['+1 coin'],
      hint: T('coin.Collected += () => Console.WriteLine("+1 coin");', 'coin.Collected += () => Console.WriteLine("+1 coin");'),
      solution: 'using System;\n\nCoin coin = new Coin();\ncoin.Collected += () => Console.WriteLine("+1 coin");\ncoin.Collect();\n\nclass Coin\n{\n    public event Action Collected;\n    public void Collect() { Collected?.Invoke(); }\n}\n',
    },
  },
  {
    id: 'generics',
    icon: '🧰',
    title: T('Generics <T>: one class for any type', 'Обобщения <T>: один класс для любого типа'),
    goal: T('Read and write classes like List<T> yourself.', 'Читать и писать классы вроде List<T> самому.'),
    intro: [
      T('T is a placeholder for a type. Stack<T> written once works as Stack<int>, Stack<string>, Stack<Enemy>…', 'T — это заглушка для типа. Stack<T>, написанный один раз, работает как Stack<int>, Stack<string>, Stack<Enemy>…'),
      T('That is exactly how List<T>, Dictionary<TKey, TValue> and GetComponent<T>() work.', 'Именно так устроены List<T>, Dictionary<TKey, TValue> и GetComponent<T>().'),
    ],
    inGame: T('An object pool Pool<Bullet>, a save system Load<T>(), GetComponent<T>().', 'Пул объектов Pool<Bullet>, система сохранений Load<T>(), GetComponent<T>().'),
    lang: 'cs',
    code: `using System;
using System.Collections.Generic;

Slot<string> weapon = new Slot<string>();
weapon.Put("Sword");
Slot<int> ammo = new Slot<int>();
ammo.Put(12);
Console.WriteLine(weapon.Item + ", ammo " + ammo.Item);
Console.WriteLine(Last(new List<string> { "a", "b", "c" }));

T Last<T>(List<T> items)
{
    return items[items.Count - 1];
}

class Slot<T>
{
    public T Item;
    public void Put(T thing)
    {
        Item = thing;
    }
}`,
    notes: [
      N('class Slot<T>', 'T will be decided when the slot is created.', 'T определится, когда слот создадут.'),
      N('Slot<int> ammo', 'Here T = int.', 'Здесь T = int.'),
      N('T Last<T>(List<T> items)', 'A generic method: works for a list of anything.', 'Обобщённый метод: работает для списка чего угодно.'),
    ],
    quiz: [
      Q(T('In GetComponent<Rigidbody2D>(), what is T?', 'Что такое T в GetComponent<Rigidbody2D>()?'), ['Rigidbody2D', 'GameObject', 'int'], 0, T('The type in < > replaces T.', 'Тип в < > подставляется вместо T.')),
    ],
    task: {
      text: T('Write T First<T>(List<T> items) that returns items[0], and print First(new List<int> { 4, 5 }) → 4.', 'Напиши T First<T>(List<T> items), который возвращает items[0], и выведи First(new List<int> { 4, 5 }) → 4.'),
      starter: 'using System;\nusing System.Collections.Generic;\n\nConsole.WriteLine(First(new List<int> { 4, 5 }));\n\n// write First<T> here\n',
      expect: ['4'],
      hint: T('T First<T>(List<T> items) { return items[0]; }', 'T First<T>(List<T> items) { return items[0]; }'),
      solution: 'using System;\nusing System.Collections.Generic;\n\nConsole.WriteLine(First(new List<int> { 4, 5 }));\n\nT First<T>(List<T> items)\n{\n    return items[0];\n}\n',
    },
  },
  {
    id: 'null-safety',
    icon: '🛡️',
    title: T('Safe with null: ?. ?? ??=', 'Безопасно с null: ?. ?? ??='),
    goal: T('Avoid NullReferenceException in one short line.', 'Избегать NullReferenceException одной короткой строкой.'),
    intro: [
      T('a?.b means "if a is null, the result is null — do not crash". a ?? b means "a, or b if a is null". a ??= b means "if a is null, put b in".', 'a?.b значит «если a = null, результат null — не падать». a ?? b значит «a, а если a = null — то b». a ??= b значит «если a = null, положить туда b».'),
      T('Note for Unity: for destroyed GameObjects use if (obj != null) — ?. does not see that a Unity object was destroyed.', 'Важно для Unity: для уничтоженных GameObject используй if (obj != null) — ?. не видит, что объект Unity уничтожен.'),
    ],
    inGame: T('Optional references: target?.position, saved name ?? "Player".', 'Необязательные ссылки: target?.position, сохранённое имя ?? "Player".'),
    lang: 'cs',
    code: `using System;

string savedName = null;
Console.WriteLine("Length: " + (savedName?.Length ?? 0));
string shown = savedName ?? "Player";
Console.WriteLine("Hello, " + shown);
savedName ??= "Ari";
Console.WriteLine("Saved: " + savedName);`,
    notes: [
      N('savedName?.Length ?? 0', 'null?.Length is null → ?? gives 0.', 'null?.Length даёт null → ?? даёт 0.'),
      N('savedName ?? "Player"', 'A default value when nothing is saved.', 'Значение по умолчанию, когда ничего не сохранено.'),
      N('savedName ??= "Ari";', 'Fill only if empty.', 'Заполнить, только если пусто.'),
    ],
    quiz: [
      Q(T('string s = null; what is s ?? "x"?', 'string s = null; чему равно s ?? "x"?'), ['null', '"x"', T('error', 'ошибка')], 1, T('?? takes the right side when the left is null.', '?? берёт правую часть, когда левая — null.')),
    ],
    task: {
      text: T('nickname is null. Print it with a default "Guest" using ??.', 'nickname = null. Выведи его со значением по умолчанию "Guest" через ??.'),
      starter: 'using System;\n\nstring nickname = null;\n',
      expect: ['Guest'],
      hint: T('Console.WriteLine(nickname ?? "Guest");', 'Console.WriteLine(nickname ?? "Guest");'),
      solution: 'using System;\n\nstring nickname = null;\nConsole.WriteLine(nickname ?? "Guest");\n',
    },
  },
  {
    id: 'const-readonly',
    icon: '🔐',
    title: T('const and readonly: values that never change', 'const и readonly: значения, которые не меняются'),
    goal: T('Protect important numbers from accidental changes.', 'Защитить важные числа от случайных изменений.'),
    intro: [
      T('const is fixed when you write the code: const int MaxLives = 3;. readonly is set once in the constructor and never changes after that.', 'const задаётся, когда пишешь код: const int MaxLives = 3;. readonly задаётся один раз в конструкторе и больше не меняется.'),
      T('If someone tries to change them, C# reports an error before the game even starts — the cheapest bug fix ever.', 'Если кто-то попробует их изменить, C# покажет ошибку ещё до запуска игры — самое дешёвое исправление бага.'),
    ],
    inGame: T('Layer numbers, tag names (const string PlayerTag = "Player";), IDs.', 'Номера слоёв, имена тегов (const string PlayerTag = "Player";), идентификаторы.'),
    lang: 'cs',
    code: `using System;

const int MaxLives = 3;
Hero hero = new Hero("Ari");
Console.WriteLine(hero.Name + " has " + MaxLives + " lives");
Console.WriteLine("Tag: " + Tags.Player);

class Hero
{
    public readonly string Name;
    public Hero(string name)
    {
        Name = name;
    }
}

class Tags
{
    public const string Player = "Player";
}`,
    notes: [
      N('const int MaxLives = 3;', 'Never changes.', 'Никогда не меняется.'),
      N('public readonly string Name;', 'Set once, in the constructor.', 'Задаётся один раз, в конструкторе.'),
      N('public const string Player = "Player";', 'No more typos in tag names: Tags.Player everywhere.', 'Больше никаких опечаток в тегах: везде Tags.Player.'),
    ],
    quiz: [
      Q(T('Where can a readonly field be set?', 'Где можно задать readonly-поле?'), [T('In the constructor (or where it is declared)', 'В конструкторе (или там, где объявлено)'), T('Anywhere', 'Где угодно'), T('Only in Update', 'Только в Update')], 0, T('After the constructor it is locked.', 'После конструктора оно заперто.')),
    ],
  },
  {
    id: 'dict-loop',
    icon: '🗂️',
    title: T('Going through a Dictionary', 'Перебор Dictionary'),
    goal: T('Show every key and value — an inventory or a price list.', 'Показать все ключи и значения — инвентарь или прайс.'),
    intro: [
      T('foreach (var pair in dict) gives KeyValuePair items: pair.Key and pair.Value.', 'foreach (var pair in dict) даёт элементы KeyValuePair: pair.Key и pair.Value.'),
      T('You can also go through only the keys (dict.Keys) or only the values (dict.Values).', 'Можно перебрать только ключи (dict.Keys) или только значения (dict.Values).'),
    ],
    inGame: T('An inventory screen: item → count.', 'Экран инвентаря: предмет → количество.'),
    lang: 'cs',
    code: `using System;
using System.Collections.Generic;

var bag = new Dictionary<string, int>();
bag["potion"] = 2;
bag["arrow"] = 15;
bag["potion"] += 1;

int total = 0;
foreach (var pair in bag)
{
    Console.WriteLine(pair.Key + " x" + pair.Value);
    total += pair.Value;
}
Console.WriteLine("Items: " + total);`,
    notes: [
      N('bag["potion"] += 1;', 'Change the value under a key.', 'Меняем значение под ключом.'),
      N('foreach (var pair in bag)', 'Every key-value pair in turn.', 'Каждая пара ключ–значение по очереди.'),
    ],
    quiz: [
      Q(T('What is "Items:" at the end?', 'Что будет в «Items:» в конце?'), ['17', '18', '2'], 1, T('3 potions + 15 arrows = 18.', '3 зелья + 15 стрел = 18.')),
    ],
    task: {
      text: T('Print every key of the dictionary on its own line: hp, mp.', 'Выведи каждый ключ словаря на отдельной строке: hp, mp.'),
      starter: 'using System;\nusing System.Collections.Generic;\n\nvar stats = new Dictionary<string, int> { ["hp"] = 10, ["mp"] = 4 };\n// foreach here\n',
      expect: ['hp', 'mp'],
      hint: T('foreach (var pair in stats) Console.WriteLine(pair.Key);', 'foreach (var pair in stats) Console.WriteLine(pair.Key);'),
      solution: 'using System;\nusing System.Collections.Generic;\n\nvar stats = new Dictionary<string, int> { ["hp"] = 10, ["mp"] = 4 };\nforeach (var pair in stats)\n{\n    Console.WriteLine(pair.Key);\n}\n',
    },
  },
];

export const COURSES: Course[] = [
  { id: 'cs-unity', icon: '🎮', title: T('C# for Unity', 'C# для Unity'), about: T('From variables to classes, inheritance and vectors. Every example runs for real — watch the values change.', 'От переменных до классов, наследования и векторов. Каждый пример запускается по-настоящему — видно, как меняются значения.'), lessons: CS },
  { id: 'cs-advanced', icon: '🚀', title: T('C# further (part 2)', 'C# дальше (часть 2)'), about: T('static, struct vs class (why CS1612 happens), interfaces, Action/Func, events, generics <T>, ?. ??, const/readonly, Dictionary loops — all running for real, with tasks.', 'static, struct и class (откуда CS1612), интерфейсы, Action/Func, события, обобщения <T>, ?. ??, const/readonly, перебор Dictionary — всё с настоящим запуском и заданиями.'), lessons: ADV },
  { id: 'unreal', icon: '🏗️', title: T('Unreal Engine C++', 'Unreal Engine C++'), about: T('Read real Unreal C++: Actors, Tick, UPROPERTY, pointers, Blueprint functions — compared with Unity.', 'Читаем настоящий C++ из Unreal: Actor, Tick, UPROPERTY, указатели, функции для Blueprints — в сравнении с Unity.'), lessons: UE },
];

export const COURSE_LESSON_COUNT = COURSES.reduce((n, c) => n + c.lessons.length, 0);
