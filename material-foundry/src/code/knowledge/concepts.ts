// The offline knowledge base: programming concepts explained at five levels.
//
// L1 explain like I'm five   – everyday comparison, very short
// L2 complete beginner       – purpose, no jargon
// L3 technical               – the actual programming concept
// L4 deep technical          – syntax, data, edge cases, consequences
// L5 teach me to do it       – a small practical exercise (filled in with the real code later)
//
// `simpler` holds alternative explanations shown by "I don't understand" (cycled in order), and
// `example` is shown by "Show me with an example". `change` explains what typically happens when
// this kind of thing is modified; `why` explains why code is written this way.

export interface Concept {
  id: string;
  title: string;
  levels: [string, string, string, string, string];
  simpler: string[];
  example?: { code: string; lang: string; explain: string };
  why?: string;
  change?: string;
  related?: string[];
}

const C = (c: Concept): Concept => c;

export const CONCEPTS: Concept[] = [
  C({
    id: 'variable',
    title: 'Variable',
    levels: [
      'A variable is like a labelled box. You put something in it, and later you can look inside by using the label.',
      'A variable is a name that holds a piece of information, such as a number or some text, so the program can remember it and use it later.',
      'A variable is a named storage location. Assigning to it stores a value; reading it returns the current value. Its value can change while the program runs.',
      'A variable binds a name to a value within a scope (the part of the code where the name is visible). Its lifetime, mutability and type rules depend on the language and on how it was declared (e.g. let/const/var, local/global). Reading a variable before it is assigned is an error in many languages; shadowing (a new variable with the same name in an inner scope) hides the outer one.',
      'Exercise: find where this variable is created and every place it is used. Predict what would happen to each use if its value were different.',
    ],
    simpler: [
      'Think of a sticky note with a name written on it. Whatever is written under the name can be read again later or replaced.',
      'Like the "score" on a scoreboard: the word "score" stays the same, but the number next to it can change during the game.',
    ],
    example: { lang: 'python', code: 'age = 7\nage = age + 1\nprint(age)   # shows 8', explain: 'The box called "age" first holds 7. Then we take what is inside, add 1, and put the result back. Now it holds 8.' },
    why: 'Names make values reusable and readable: instead of repeating a number or text, the code refers to it by a meaningful name.',
    change: 'Changing the value stored in a variable changes the result of every line that later reads it. Renaming it requires renaming every use, or the program will not find it.',
    related: ['constant', 'parameter', 'operator-assignment'],
  }),
  C({
    id: 'constant',
    title: 'Constant',
    levels: [
      'A constant is a box with a lock: you put something in once and it stays the same.',
      'A constant is a name for a value that is not supposed to change, like a fixed price or a setting.',
      'A constant is a name bound to a value that should not be reassigned. Many languages enforce this (const, final, val); a name written in CAPITAL_LETTERS is a convention meaning "do not change this".',
      'Immutability may be enforced by the language (reassignment is a compile/runtime error) or only by convention (ALL_CAPS names in Python). Note: a constant name pointing at an object or list may still allow the contents of that object to change (e.g. JavaScript const arrays can be pushed to).',
      'Exercise: find every place this constant is used. If you changed its value, which results would change?',
    ],
    simpler: ['Like the number of days in a week: it is always 7, so the program writes it down once and uses the name everywhere.'],
    example: { lang: 'javascript', code: 'const TAX_RATE = 0.2;\nconst price = 100 * (1 + TAX_RATE); // 120', explain: 'TAX_RATE is written once. If tax changes, you only need to change this one line.' },
    why: 'Giving fixed values a name avoids "magic numbers" scattered through the code and makes changes safe: one edit updates every use.',
    change: 'Changing a constant changes every calculation that uses it. This is usually the safest kind of change, because it is in one place.',
  }),
  C({
    id: 'parameter',
    title: 'Parameter (function input)',
    levels: [
      'A parameter is like an empty slot in a recipe: "add ___ cups of sugar". Whoever uses the recipe fills in the slot.',
      'A parameter is an input of a function. When the function is used, the caller gives a value for each parameter, and the function works with that value.',
      'Parameters are variables declared in a function definition. Each call passes arguments, which are assigned to the parameters for that call only.',
      'Parameters are local to the function. Languages differ in how arguments are passed (by value, by reference, by sharing), whether defaults are allowed (x=0), whether arguments can be named, and whether types are checked. Changing the number or order of parameters breaks every call site that does not match.',
      'Exercise: find a place where this function is called and match each value given in the call to the parameter that receives it.',
    ],
    simpler: ['Like the blanks on a form: "Name: ____". The form (function) stays the same; each person (call) fills in different information.'],
    example: { lang: 'python', code: 'def greet(name):\n    print("Hello " + name)\n\ngreet("Ana")   # Hello Ana\ngreet("Ben")   # Hello Ben', explain: '"name" is the parameter. The first time it holds "Ana", the second time "Ben".' },
    why: 'Parameters let one function handle many different situations instead of writing the same steps again for every value.',
    change: 'Renaming a parameter only affects the inside of its function. Adding, removing or reordering parameters affects every place that calls the function.',
  }),
  C({
    id: 'function',
    title: 'Function',
    levels: [
      'A function is like a recipe card. It has a name and a list of steps. When you want the dish, you just say the name and the steps happen.',
      'A function is a named set of instructions. Instead of writing the same steps many times, the program writes them once and "calls" the function by its name whenever it needs them. It can receive information (inputs) and give back a result.',
      'A function (also called a procedure, routine or subroutine) is a reusable block of code with a name, a list of parameters and a body. Calling it runs the body with the given arguments; "return" ends it and passes a value back to the caller.',
      'A function definition binds a name to callable code. Key details: its signature (parameter names, types, defaults), its return value (or none), side effects (changing outside data, printing, writing files), and where it is visible (scope, exports). Recursion (calling itself), closures (using variables from outside), and asynchronous functions (async) change how and when the body runs. Changing a signature affects all callers.',
      'Exercise: read the steps inside this function one by one and write in your own words what each does. Then find one place where it is used.',
    ],
    simpler: [
      'Like a washing machine programme: you press "Quick wash" (the name) and a whole series of steps runs by itself.',
      'Like a vending machine: you put something in (money and a choice), it does its work inside, and something comes out (a snack).',
    ],
    example: { lang: 'javascript', code: 'function double(n) {\n  return n * 2;\n}\n\ndouble(4);  // 8\ndouble(10); // 20', explain: '"double" is written once. Each call gives a different number and gets back twice that number.' },
    why: 'Functions avoid repetition, give a name to an idea ("calculate total"), and let you change behaviour in one place.',
    change: 'Changing the steps inside a function changes the result everywhere it is called. Renaming it requires updating every call.',
    related: ['parameter', 'return', 'function-call'],
  }),
  C({
    id: 'method',
    title: 'Method (function belonging to a class)',
    levels: [
      'A method is something an object knows how to do, like a dog that knows "sit" and "fetch".',
      'A method is a function that belongs to a class or object. It usually works with that object\'s own information.',
      'A method is a function defined inside a class. It is called on an object (obj.method()) and can access the object\'s data, usually through "self" or "this".',
      'Methods receive the object as an implicit or explicit first argument (this/self). They can be overridden by subclasses, may be static (belong to the class, not instances) or private. Calls through a base type may run a subclass\'s version (dynamic dispatch), so static analysis cannot always tell which method runs.',
      'Exercise: find which class this method belongs to and one place where it is called on an object.',
    ],
    simpler: ['If a class is a blueprint for a car, a method is something the car can do: "start engine", "honk".'],
    example: { lang: 'python', code: 'class Dog:\n    def bark(self):\n        print("Woof")\n\nrex = Dog()\nrex.bark()', explain: '"bark" is a method of Dog. "rex" is one dog, and rex.bark() makes that dog bark.' },
    change: 'Changing a method changes the behaviour of every object of that class (and possibly of classes built on it).',
  }),
  C({
    id: 'function-call',
    title: 'Function call',
    levels: [
      'Calling a function is like saying "Go!" to a robot that already knows a job. It does the job and maybe hands you something back.',
      'This line uses (calls) a function: it asks the steps written elsewhere to run now, with the information given in the brackets.',
      'A call executes a function: arguments in the parentheses are evaluated and passed to the parameters, the function body runs, and the call expression evaluates to the returned value.',
      'Evaluation order of arguments, whether arguments are copied or shared, exceptions thrown inside the callee, and which definition is actually called (overloads, methods on different classes, imported names, dynamically created functions) all affect the result. Static analysis links calls to definitions by name; dynamic cases can only be confirmed by running the code.',
      'Exercise: jump to the definition of this function, read what it does, and predict what this call will give back with the values passed here.',
    ],
    simpler: ['Like pressing a button on a microwave labelled "Popcorn": you do not need to know the steps, you just press it and it happens.'],
    example: { lang: 'python', code: 'def add(a, b):\n    return a + b\n\nresult = add(2, 3)  # result is 5', explain: 'add(2, 3) runs the steps of "add" with a=2 and b=3 and gives back 5.' },
    why: 'Calling a function reuses its steps without repeating them here.',
    change: 'Changing the values passed here only changes this one use. Changing the function itself changes every call.',
  }),
  C({
    id: 'class',
    title: 'Class',
    levels: [
      'A class is like a cookie cutter. The cutter is the class; every cookie you cut out is an object made from it.',
      'A class is a blueprint that describes a kind of thing: what information it holds and what it can do. The program can create many objects from one class.',
      'A class groups data (fields/properties) and behaviour (methods). Creating an instance (new X(), X()) builds an object with its own copy of the data; methods operate on that object.',
      'Classes support encapsulation (hiding internals with private members), inheritance (extends: building on another class), and polymorphism (different classes answering the same method). Constructors (__init__, constructor, init) set up new objects. Changing a class affects all its instances and subclasses.',
      'Exercise: list the information (fields) and the actions (methods) this class has. Then find where an object of this class is created.',
    ],
    simpler: ['Like the plan of a house. The plan is not a house, but you can build many houses from it, each with its own furniture.'],
    example: { lang: 'python', code: 'class Cat:\n    def __init__(self, name):\n        self.name = name\n\ntom = Cat("Tom")\nfelix = Cat("Felix")', explain: 'Cat is the blueprint. tom and felix are two different cats made from it, each with its own name.' },
    change: 'Changing a class changes every object created from it.',
  }),
  C({
    id: 'struct',
    title: 'Structure (struct)',
    levels: [
      'A struct is like a lunchbox with compartments: one for the sandwich, one for the fruit — all carried together.',
      'A struct groups several related pieces of information under one name, for example a point with an x and a y.',
      'A struct is a composite data type with named fields. Unlike classes in some languages, structs are often simple data holders, sometimes copied by value.',
      'Struct semantics vary: in C they are plain memory layouts; in Rust/Go/Swift/C# they can have methods (via impl, receivers or members); value types are copied on assignment, which affects whether changes are visible elsewhere.',
      'Exercise: list the fields of this struct and find where one is created.',
    ],
    simpler: ['Like a contact card: name, phone and email kept together as one thing.'],
  }),
  C({
    id: 'enum',
    title: 'Enumeration (enum)',
    levels: [
      'An enum is like the choices on a traffic light: red, yellow, green — nothing else.',
      'An enum is a fixed list of named options. Using names instead of numbers makes the code easier to read and harder to get wrong.',
      'An enumeration defines a type whose values are a fixed set of named constants (e.g. Color.Red). Some languages allow attaching data to each option (Rust, Swift).',
      'Code that handles every option (switch/match) must be updated when a new option is added; some languages (Rust) enforce this exhaustively, others silently fall through to a default.',
      'Exercise: list all options of this enum and find where one of them is used.',
    ],
    simpler: ['Like the sizes on a T-shirt label: S, M, L, XL. You can only pick one of these.'],
  }),
  C({
    id: 'interface',
    title: 'Interface / contract',
    levels: [
      'An interface is like a job description: it says what someone must be able to do, not how they do it.',
      'An interface lists what functions or information something must have. Different parts of the program can then work together as long as they follow this list.',
      'An interface (or protocol, trait) declares members without implementing them. Classes or types that implement it promise to provide those members, so code can use any of them interchangeably.',
      'Interfaces enable polymorphism and decoupling. In TypeScript they exist only at compile time (they disappear when the code runs). Changing an interface forces every implementation to change accordingly.',
      'Exercise: list what this interface requires, and look for a class or object that provides it.',
    ],
    simpler: ['Like a power socket: any plug of the right shape works, whatever device it belongs to.'],
  }),
  C({
    id: 'type',
    title: 'Type',
    levels: [
      'A type says what kind of thing something is: a number, a word, a list…',
      'A type describes what kind of information a value is (number, text, yes/no, list, or a custom kind). It helps prevent mixing things that do not fit together.',
      'Types classify values and determine which operations are allowed (you can multiply numbers, not text). Statically typed languages check types before running; dynamically typed ones check while running.',
      'Type annotations may be enforced by a compiler (C#, Java, Rust, TypeScript) or be hints only (Python). Generic types take parameters (List<int>). Type mismatches are a common source of errors; changing a type can ripple through every place the value flows.',
      'Exercise: find where this type is used and describe in your own words what kind of data it holds.',
    ],
    simpler: ['Like labels on kitchen jars: "sugar", "salt". The label tells you what is inside so you do not mix them up.'],
  }),
  C({
    id: 'type-keyword',
    title: 'Type word',
    levels: [
      'This word tells the computer what kind of thing comes next.',
      'This keyword describes a kind of data (for example whole numbers or text), or introduces a definition of a new kind of data.',
      'A built-in type name or type-related keyword. It constrains which values are allowed and which operations are valid.',
      'Primitive types differ by language (int size, float precision, signedness, string encoding). Choosing a type affects range limits (overflow), precision (rounding) and memory use.',
      'Exercise: find a value of this type in the code and check that it really is that kind of data.',
    ],
    simpler: ['Like writing "litres" or "kilograms" after a number: it tells what the number means.'],
  }),
  C({
    id: 'property',
    title: 'Property / field',
    levels: [
      'A property is one piece of information that belongs to something, like the colour of a car.',
      'A property (or field) is a named piece of information stored inside an object, reached with a dot: car.color.',
      'Fields/properties are members of an object or class holding data. "a.b" reads property b of object a; assigning to it changes the object.',
      'Property access may run code (getters/setters), may fail if the object is empty (null/undefined), and its existence often cannot be proven statically in dynamic languages; the link to a definition is therefore made by name and marked "likely".',
      'Exercise: find the object this property belongs to and where the property gets its value.',
    ],
    simpler: ['Like the fields of an ID card: name, birthday, photo. Each is a property of the card.'],
  }),
  C({
    id: 'import',
    title: 'Import (bringing in other code)',
    levels: [
      'An import is like borrowing a tool from your neighbour so you do not have to build it yourself.',
      'This line brings in code from another file or from a library (code written by other people), so it can be used here.',
      'Import/include/require statements load another module and make its exported names available in this file.',
      'Resolution rules differ: relative paths (./x) point to project files; bare names point to installed packages or the standard library. Importing can run that module\'s top-level code. Removing an import breaks every use of the names it provided; circular imports can cause subtle bugs.',
      'Exercise: find which names this import provides and where they are used in this file.',
    ],
    simpler: ['Like plugging in a ready-made appliance instead of building your own toaster.'],
    change: 'Removing or renaming an import breaks every place in this file that uses what it brought in.',
  }),
  C({
    id: 'export',
    title: 'Export',
    levels: [
      'Export is like putting something on a shelf so others can take it.',
      'Export makes something from this file available for other files to use.',
      'Exported names are part of a module\'s public interface; other modules can import them.',
      'Renaming or removing an exported name breaks every file that imports it. Default exports and named exports are imported differently.',
      'Exercise: find which other files import what is exported here (use the project map).',
    ],
    simpler: ['Like a shop window: things in the window are available to customers; things in the back room are not.'],
    change: 'Other files may depend on exported names: changing them can break those files.',
  }),
  C({
    id: 'namespace',
    title: 'Module / package / namespace',
    levels: [
      'A namespace is like a family name: there can be many "Anna"s, but "Anna Smith" is clear.',
      'This groups related code under one name so that names from different parts do not clash.',
      'Namespaces/modules/packages provide qualified names (pkg.name) and control visibility between parts of a program.',
      'In Go, "package main" marks a runnable program. In Java/C#, the package/namespace usually mirrors the folder structure. Moving code between namespaces changes how it must be imported.',
      'Exercise: find other files that belong to the same package or namespace.',
    ],
    simpler: ['Like folders on a computer: two files can have the same name if they are in different folders.'],
  }),
  C({
    id: 'return',
    title: 'Return',
    levels: [
      '"Return" means "I am done, here is your answer."',
      '"return" ends the function and gives a result back to the place that used the function.',
      'A return statement exits the current function immediately and makes the call expression evaluate to the given value (or to "nothing" if no value is given).',
      'Lines after a return in the same block never run. Some languages return the last expression automatically (Ruby, Rust without semicolon). Functions with several returns can give different kinds of results depending on the path taken.',
      'Exercise: find which value is returned here and where the function is called, to see where this value goes.',
    ],
    simpler: ['Like a waiter bringing the food back to your table: the kitchen did the work, and "return" delivers the result.'],
    example: { lang: 'python', code: 'def square(n):\n    return n * n\n\nx = square(3)  # x is 9', explain: 'square works out 3 × 3 and "return" hands 9 back, which is stored in x.' },
  }),
  C({
    id: 'if',
    title: 'Condition (if)',
    levels: [
      '"If" is like saying: "If it is raining, take an umbrella." You only do it when the thing is true.',
      'An "if" checks a condition. The lines that belong to it run only when the condition is true; otherwise they are skipped.',
      'An if statement evaluates a boolean condition and executes its block when true, optionally an else block when false. Conditions often use comparisons (==, <, >) and logical operators (and/or/not).',
      'Truthiness rules differ between languages (empty lists, 0, "" and null may count as false). Order of else-if branches matters: the first true branch wins. Changing a condition changes which code runs and can make some branches unreachable.',
      'Exercise: describe the condition in plain words. Then think of one value that makes it true and one that makes it false.',
    ],
    simpler: ['Like a door that only opens when you have the key. If you have it, you go through; if not, you stay outside.'],
    example: { lang: 'javascript', code: 'if (age >= 18) {\n  console.log("You can vote");\n} else {\n  console.log("Too young to vote");\n}', explain: 'The computer checks "is age 18 or more?". Only one of the two messages is shown.' },
    change: 'Changing the condition changes when these lines run. Swapping < and > (or removing "not") reverses the decision.',
  }),
  C({
    id: 'else',
    title: 'Otherwise (else)',
    levels: [
      '"Else" means "otherwise". If it is not raining, wear sunglasses.',
      '"else" holds the lines that run when the "if" condition was not true.',
      'The else branch runs when all preceding if/else-if conditions were false. "else if"/"elif" chains test further conditions in order.',
      'Exactly one branch of an if/else chain runs. Removing an else changes behaviour only in the cases where the condition is false.',
      'Exercise: find the "if" this belongs to and describe when this part runs.',
    ],
    simpler: ['Like plan B: if plan A does not work, do plan B.'],
  }),
  C({
    id: 'loop-for',
    title: 'Loop (for)',
    levels: [
      'A loop is like stirring soup 10 times: you repeat the same movement again and again.',
      'A "for" loop repeats the same steps several times, often once for every item in a list.',
      'A for loop iterates: it runs its body once per element of a collection (for item in list) or for a counter range (for i = 0; i < n; i++). A loop variable holds the current item.',
      'Off-by-one errors (< vs <=), changing the collection while looping, and infinite loops are common problems. The loop variable may or may not exist after the loop depending on the language. Long loops can make programs slow.',
      'Exercise: work out how many times this loop runs and what changes each time.',
    ],
    simpler: ['Like a teacher handing out papers: "for each student, give one paper". The same action, repeated for everyone.'],
    example: { lang: 'python', code: 'for fruit in ["apple", "pear", "plum"]:\n    print(fruit)', explain: 'The print line runs three times: first with apple, then pear, then plum.' },
    change: 'Changing what the loop goes through changes how many times it repeats. Changing the body changes what happens on every repetition.',
  }),
  C({
    id: 'loop-while',
    title: 'Loop (while)',
    levels: [
      '"While" means "keep doing it as long as…", like "keep walking while the light is green".',
      'A "while" loop repeats its steps as long as a condition stays true. It stops when the condition becomes false.',
      'A while loop re-checks its condition before each iteration. Something inside the loop must eventually make the condition false, or it never ends.',
      'Infinite loops freeze programs. do/while variants run the body at least once. break/continue alter the flow. Conditions depending on outside events (input, time, network) cannot be predicted statically.',
      'Exercise: find what inside the loop changes so that the condition eventually becomes false.',
    ],
    simpler: ['Like brushing your teeth "while" the timer is running: you stop when the timer ends.'],
  }),
  C({
    id: 'break',
    title: 'Break',
    levels: ['"Break" is like saying "stop, I am done!" in the middle of a game.', '"break" stops the loop right away; the program continues after the loop.', 'break exits the innermost loop (or switch case) immediately.', 'In nested loops only the innermost loop stops unless labels are used. Missing break in switch cases can cause "fall-through" into the next case in C-like languages.', 'Exercise: find the condition under which the loop stops early because of this break.'],
    simpler: ['Like leaving a queue before your turn: you just step out.'],
  }),
  C({
    id: 'continue',
    title: 'Continue',
    levels: ['"Continue" means "skip the rest of this turn and go to the next one".', '"continue" skips the remaining steps of the current round of the loop and starts the next round.', 'continue jumps to the next iteration of the innermost loop.', 'Overusing continue can hide logic; ensure the loop still makes progress (e.g. counters are updated) or a while loop may never end.', 'Exercise: find which items are skipped by this continue.'],
    simpler: ['Like skipping a song in a playlist: the playlist keeps going with the next song.'],
  }),
  C({
    id: 'switch',
    title: 'Choice between cases (switch / match)',
    levels: ['A switch is like a menu: pick number 1, 2 or 3, and you get a different dish.', 'This chooses one of several paths depending on a value.', 'switch/match/when compares a value against cases and runs the matching branch (or a default).', 'Fall-through (C, JavaScript without break), exhaustiveness checks (Rust, Kotlin, Swift) and pattern matching with conditions differ between languages. Adding a new possible value may require a new case.', 'Exercise: list each case and what happens in it.'],
    simpler: ['Like a train switch on railway tracks: depending on the setting, the train goes one way or another.'],
  }),
  C({
    id: 'try',
    title: 'Error handling (try / catch)',
    levels: ['"Try" is like trying to open a jar. If it does not work, you have a backup plan instead of crying.', 'This part tries to do something that might fail (like reading a file). If an error happens, the "catch/except" part handles it instead of crashing the program.', 'try/catch (try/except) runs code and intercepts exceptions (errors) raised inside it, so the program can recover, report or clean up. finally runs in all cases.', 'Catching too broadly can hide real bugs. The type of error caught matters. Errors raised in functions called from the try block also land here. Removing error handling can make the program crash on bad input.', 'Exercise: find what could go wrong inside the "try" part and what the program does when it happens.'],
    simpler: ['Like a safety net under a tightrope walker: if they slip, the net catches them.'],
  }),
  C({
    id: 'throw',
    title: 'Raising an error (throw / raise)',
    levels: ['"Throw" is like raising your hand and shouting "Problem!" so a grown-up comes to help.', 'This signals that something went wrong. The program stops this path and looks for code that knows how to handle the problem.', 'throw/raise creates an exception that propagates up the call stack until a matching catch/except handles it; if none does, the program usually stops with an error message.', 'Exceptions skip the remaining lines of every function they pass through. Error messages and types are part of how callers react. Changing what is thrown can break handlers elsewhere.', 'Exercise: find under which condition this error is raised and where it might be caught.'],
    simpler: ['Like pulling the emergency brake on a train: everything stops until someone deals with it.'],
  }),
  C({
    id: 'async',
    title: 'Waiting for slow work (async / await)',
    levels: ['Async is like ordering pizza: while you wait, you can do other things. "Await" is waiting at the door when you need the pizza.', 'Some work is slow (downloading, reading files). "async" and "await" let the program wait for it without freezing everything else.', 'An async function returns a promise/future/task. await pauses that function until the result is ready, letting other work continue meanwhile.', 'Forgetting await gives you a pending promise instead of a value. Errors in async code surface when awaited. Order of completion of parallel operations is not guaranteed.', 'Exercise: find the slow operation being waited for here and what happens with its result.'],
    simpler: ['Like putting clothes in the washing machine and doing something else until it beeps.'],
  }),
  C({
    id: 'new',
    title: 'Creating an object (new)',
    levels: ['"New" means "make me a fresh one from this blueprint".', 'This creates a new object from a class.', '"new X(...)" allocates an object of class X and runs its constructor with the given arguments.', 'Each "new" creates a separate object with its own data. In C++ objects created with new must be freed (delete) to avoid memory leaks.', 'Exercise: find the class being created here and what its constructor does.'],
    simpler: ['Like baking a new cake from the same recipe: each cake is separate.'],
  }),
  C({
    id: 'self-reference',
    title: 'This object (self / this)',
    levels: ['"Self" means "me": the object talking about itself.', '"self"/"this" refers to the object the current method is working on.', 'Inside a method, self/this is the instance on which the method was called; self.x reads or writes that instance\'s field x.', 'In JavaScript, "this" depends on how a function is called (and arrow functions inherit it); in Python, self is an explicit first parameter. Mistakes here affect only one object vs. all objects.', 'Exercise: find which object "self/this" means when this method is called.'],
    simpler: ['Like saying "my name" — whoever says it means their own name.'],
  }),
  C({
    id: 'boolean',
    title: 'Yes/No value (boolean)',
    levels: ['A boolean is a light switch: on or off, yes or no.', 'This is a yes/no value: true or false. Programs use it to make decisions.', 'Boolean values (true/false) result from comparisons and are combined with logical operators. They control if/while conditions.', 'Languages convert other values to booleans differently (0, "", empty lists may be false). Inverting a boolean flips every decision that depends on it.', 'Exercise: find where this value is used to make a decision.'],
    simpler: ['Like a yes/no question on a form: there are only two possible answers.'],
    change: 'Switching true and false flips every decision that depends on this value.',
  }),
  C({
    id: 'null',
    title: 'Nothing / empty value (null)',
    levels: ['Null is an empty box: there is nothing inside.', 'This means "no value": nothing has been put here (yet).', 'null/None/nil represents the absence of a value. Using it as if it were an object usually causes an error ("null reference").', 'Null handling is a frequent source of crashes. Optional chaining (?.), default values (??, or) and explicit checks (is None) protect against it.', 'Exercise: find where this empty value is checked before it is used.'],
    simpler: ['Like an empty parking space: the space exists, but no car is there.'],
  }),
  C({
    id: 'string',
    title: 'Text (string)',
    levels: ['A string is a piece of text, like words written on a label.', 'This is a piece of text written directly in the code, between quotes. The program uses it exactly as written (for example a message shown on screen).', 'A string literal is a sequence of characters. Quotes mark where it starts and ends; backslash sequences (\\n, \\") stand for special characters.', 'Encoding (UTF-8/UTF-16), escaping rules, immutability and comparisons (case sensitivity) matter. Text used as a key or compared elsewhere must match exactly; changing it can silently break such matches.', 'Exercise: change this text in your head. Would anything else in the program need to match it?'],
    simpler: ['Like the words on a road sign: the computer just shows or uses them exactly as written.'],
    change: 'Changing the text changes what is shown or stored. If other code compares against this exact text, it may stop matching.',
  }),
  C({
    id: 'template-string',
    title: 'Text with inserted values',
    levels: ['A text with holes where the computer writes in the current values, like "Hello ___!".', 'This text contains placeholders ${...} that are replaced by current values when the program runs.', 'Template literals (`text ${expr}`) and f-strings (f"{x}") interpolate expressions into strings.', 'Expressions inside run when the string is built. Inserting untrusted text into HTML or SQL can create security problems.', 'Exercise: find the values inserted into this text.'],
    simpler: ['Like a birthday card printed with "Happy birthday, [name]!" where the name is filled in.'],
  }),
  C({
    id: 'docstring',
    title: 'Documentation text (docstring)',
    levels: ['This is a note that explains what the function is for.', 'A docstring is a description written by the author at the start of a function or class, explaining what it does.', 'In Python, a string literal as the first statement of a function, class or module is its docstring, available at runtime (help(), __doc__).', 'Docstrings do not change behaviour but tools display them. They can be outdated: the code is the source of truth.', 'Exercise: compare what the docstring says with what the code actually does. Do they match?'],
    simpler: ['Like the instructions printed on the back of a box.'],
  }),
  C({
    id: 'number',
    title: 'Number',
    levels: ['This is just a number, written directly in the code.', 'This is a fixed number written in the code (a "literal"). The program uses it exactly as written.', 'A numeric literal: integer or floating point, possibly in hex (0x..) or with a unit/suffix. Its type determines its range and precision.', 'Numbers without a name ("magic numbers") are hard to understand and change consistently. Floating point numbers can have tiny rounding errors (0.1 + 0.2 ≠ 0.3 exactly). Integer types can overflow.', 'Exercise: change this number in your head to a bigger one. What would change in the result?'],
    simpler: ['Like the number on a speed-limit sign: it is a fixed value someone chose.'],
    change: 'Changing this number changes every calculation or limit that uses it here.',
  }),
  C({
    id: 'comment',
    title: 'Comment (note for people)',
    levels: ['A comment is a sticky note for people. The computer ignores it.', 'A comment is text written for humans. It explains or reminds something, and it does not change what the program does.', 'Comments are skipped by the compiler/interpreter. Syntax: // or /* */ in C-like languages, # in Python/shell/YAML, -- in SQL/Lua, <!-- --> in HTML/XML.', 'Comments can be outdated or wrong; they are not checked. Special comments may be read by tools (TODO, type hints, lint directives, license headers). "Commenting out" code disables it without deleting it.', 'Exercise: read the comment and check whether the code below really does what it says.'],
    simpler: ['Like notes in the margin of a book: useful for readers, but they are not part of the story.'],
    change: 'Changing a comment never changes how the program behaves (except special tool directives).',
  }),
  C({
    id: 'operator-arithmetic',
    title: 'Calculation symbol',
    levels: ['This symbol does maths, like + or − on a calculator.', 'This symbol calculates something: adding, subtracting, multiplying or dividing the values on its left and right.', 'An arithmetic operator combines operands into a new value. Operator precedence decides the order (× before +) unless brackets are used.', 'Behaviour depends on types: + also joins text in many languages; integer division may drop decimals; dividing by zero may crash or give Infinity; mixing types may convert values automatically.', 'Exercise: calculate the result yourself with example values. Then imagine the symbol replaced by another one.'],
    simpler: ['Exactly like the buttons on a calculator.'],
    change: 'Replacing this symbol changes the calculated result everywhere this line runs.',
  }),
  C({
    id: 'operator-comparison',
    title: 'Comparison',
    levels: ['This symbol compares two things, like asking "is this bigger?". The answer is yes or no.', 'This compares the values on both sides and gives true or false. It is usually used to make a decision.', 'Comparison operators (==, !=, <, >, <=, >=) produce booleans. In JavaScript === also compares types; in Python "is" compares identity.', 'Comparing different types, floating point numbers, or text (case, alphabetical order) can surprise. Changing < to <= changes the boundary case (off-by-one).', 'Exercise: pick values that make this comparison true and values that make it false.'],
    simpler: ['Like checking if you are tall enough for a ride: yes or no.'],
    change: 'Changing the comparison changes which cases count as "true", and therefore what happens next.',
  }),
  C({
    id: 'operator-logical',
    title: 'Combining yes/no answers',
    levels: ['"And" means both must be true. "Or" means at least one. "Not" flips yes and no.', 'This combines or reverses true/false values: and, or, not (also written &&, ||, !).', 'Logical operators combine booleans. Most languages "short-circuit": the right side is not evaluated if the left already decides the result.', 'Short-circuiting means the right side may never run (important if it has side effects). In JavaScript/Python, || / or return one of the operands, not strictly true/false.', 'Exercise: write a small table with all combinations (true/false) and the result.'],
    simpler: ['"I will go out if it is sunny AND I finished homework" — both are needed. With OR, just one is enough.'],
    change: 'Swapping "and" with "or" makes a condition much easier or harder to satisfy.',
  }),
  C({
    id: 'operator-assignment',
    title: 'Storing a value (=)',
    levels: ['"=" is like putting something into a box with a name on it.', 'A single "=" stores the value on the right in the name on the left. It does not mean "equal" like in maths; it means "becomes".', 'Assignment evaluates the right-hand expression and binds or stores the result into the left-hand target (variable, property, element).', 'Assignment may create a new variable or overwrite an existing one, depending on language and scope. Assigning objects usually shares them rather than copying. Using = instead of == in a condition is a classic bug.', 'Exercise: say this line aloud as "<left> becomes <right>".'],
    simpler: ['Like writing a new value on a whiteboard under a heading, wiping away the old one.'],
  }),
  C({
    id: 'operator-compound-assignment',
    title: 'Update a value (+= etc.)',
    levels: ['"+=" means "add this to what is already in the box".', 'This takes the current value, changes it (adds, subtracts, …) and stores the result back in the same place.', 'x += y is shorthand for x = x + y (similarly -=, *=, /=).', 'For lists/strings += may modify in place or create a new value depending on the language. The variable must already exist.', 'Exercise: write this line in the long form (x = x + y).'],
    simpler: ['Like adding coins to a piggy bank: the amount grows from what was already there.'],
  }),
  C({
    id: 'operator-member',
    title: 'Dot (taking a part of something)',
    levels: ['The dot means "the … of": car.color means "the colour of the car".', 'The dot opens up the thing on its left and takes the named part on its right — a property or a function belonging to it.', 'Member access (., ->, ::) selects a field, method or nested name from an object, pointer, module or namespace.', 'If the left side is empty (null/undefined/None), accessing a member usually crashes. "?." (optional chaining) avoids this. -> is used through pointers in C/C++ and for objects in PHP.', 'Exercise: say the expression aloud as "the … of …".'],
    simpler: ['Like an address: "Paris.EiffelTower" — first the city, then a place inside it.'],
  }),
  C({
    id: 'operator-increment',
    title: 'Add or subtract one (++ / --)',
    levels: ['"++" means "one more". "--" means "one less".', 'This adds 1 to (or subtracts 1 from) a variable, often used for counting.', 'Increment/decrement operators modify a numeric variable by one. Prefix (++x) gives the new value; postfix (x++) gives the old value.', 'Using x++ inside larger expressions can be confusing. Python has no ++ (use += 1).', 'Exercise: what is the value before and after this line?'],
    simpler: ['Like a tally counter clicker at a door: each click adds one.'],
  }),
  C({
    id: 'operator-ternary',
    title: 'Short if/else (? :)',
    levels: ['A tiny question: "is it raining ? umbrella : sunglasses".', 'This picks one of two values: if the condition before "?" is true, the value before ":" is used, otherwise the one after.', 'The conditional (ternary) operator cond ? a : b is an expression form of if/else.', 'Nested ternaries are hard to read. Only the chosen branch is evaluated.', 'Exercise: rewrite this line as a normal if/else in your head.'],
    simpler: ['Like a coin flip deciding between two prizes.'],
  }),
  C({
    id: 'operator-arrow',
    title: 'Arrow (=>)',
    levels: ['An arrow says "this goes to that".', 'In JavaScript/TypeScript, "=>" creates a short function: inputs on the left, result on the right.', 'Arrow functions (params) => expression/body define anonymous functions that keep the surrounding "this".', 'Arrow functions cannot be used as constructors and have no own "this" or "arguments". In PHP arrays and C# switch expressions, => maps keys/cases to values.', 'Exercise: name what goes in (left) and what comes out (right).'],
    simpler: ['Like a conveyor belt: things go in on one side and come out changed on the other.'],
  }),
  C({
    id: 'operator-unary',
    title: 'One-sided operator',
    levels: ['This symbol works on just one thing, like the minus in "−5".', 'This operator changes a single value, for example making it negative.', 'Unary operators (-x, +x, !x, ~x) take one operand.', 'Precedence of unary operators is high; -2 ** 2 may differ between languages.', 'Exercise: what would the value be without this symbol?'],
    simpler: ['Like a "not" in a sentence: it changes the meaning of just one word.'],
  }),
  C({
    id: 'operator-pipe',
    title: 'Pipe (|)',
    levels: ['A pipe is like a water pipe: what comes out of one machine flows into the next.', 'In shell scripts, "|" sends the output of the command on the left into the command on the right.', 'A pipeline connects stdout of one process to stdin of the next.', 'Errors in earlier commands may be hidden unless "set -o pipefail" is used. Each command may run in a separate process.', 'Exercise: describe what the first command produces and how the second command changes it.'],
    simpler: ['Like a relay race: the first runner hands the baton to the next.'],
  }),
  C({
    id: 'operator-redirect',
    title: 'Redirect (> >> <)',
    levels: ['This sends text into a file instead of the screen.', '">" writes the output into a file (replacing it), ">>" adds to the end of a file, "<" reads input from a file.', 'Shell redirections connect file descriptors (stdout/stdin/stderr) to files.', '">" overwrites files without asking: a wrong file name can destroy data. "2>" redirects error messages.', 'Exercise: find which file is written and whether it is replaced or appended to.'],
    simpler: ['Like pointing a hose into a bucket instead of onto the lawn.'],
  }),
  C({
    id: 'operator-spread',
    title: 'Spread (...)',
    levels: ['"..." means "take everything out of the box and put it here".', 'This spreads out all items of a list or object at this place.', 'Spread/rest syntax expands iterables into arguments or elements, or collects remaining items into one.', 'Spreading copies only the first level (shallow copy). Large spreads can be slow.', 'Exercise: list what the spread produces here.'],
    simpler: ['Like emptying a bag of sweets onto a table.'],
  }),
  C({
    id: 'operator-type',
    title: 'Type check',
    levels: ['This asks "what kind of thing is this?".', 'This checks or tells what type a value has.', 'typeof/instanceof/sizeof/is inspect the type or size of a value.', 'Results can be surprising (typeof null is "object" in JavaScript). Checks on type names break when classes are renamed.', 'Exercise: find what the program does differently for different types here.'],
    simpler: ['Like checking whether a fruit is an apple or an orange before peeling it.'],
  }),
  C({
    id: 'operator-other',
    title: 'Symbol',
    levels: ['This is a special symbol with a job in this line.', 'This symbol has a specific meaning in this language.', 'An operator or punctuation token; its exact meaning depends on the surrounding syntax.', 'See the symbol table below for its role; when unsure, the program treats the explanation as uncertain.', 'Exercise: try to say this line aloud, replacing the symbol with words.'],
    simpler: ['Like a road sign symbol: it has one meaning that you learn once.'],
  }),
  C({
    id: 'bracket',
    title: 'Brackets',
    levels: ['Brackets are like the two hands holding a group of things together.', 'Brackets always come in pairs: an opening one and a closing one. Everything between them belongs together.', 'Parentheses (), braces {} and square brackets [] delimit syntactic groups: calls and grouping, blocks and objects, lists and indexing.', 'A missing or extra bracket is one of the most common syntax errors: the parser then misreads everything after it. Editors match pairs; this tool shows the partner and what the pair encloses.', 'Exercise: find the partner of this bracket and describe what is inside.'],
    simpler: ['Like the covers of a book: everything between them is one book.'],
    change: 'Removing a bracket breaks the code: the computer can no longer tell where the group ends. Always remove or add brackets in pairs.',
  }),
  C({ id: 'punct-comma', title: 'Comma', levels: ['A comma separates things in a list, like in "apples, pears, plums".', 'The comma separates items: values in a list, inputs of a function, or names.', 'Commas separate elements, arguments and parameters.', 'Trailing commas are allowed in some languages and forbidden in others (e.g. JSON). In some languages a comma creates a tuple.', 'Exercise: count the items this comma separates.'], simpler: ['Like the pauses between words in a list you read aloud.'] }),
  C({ id: 'punct-semicolon', title: 'Semicolon', levels: ['A semicolon is like a full stop at the end of a sentence.', 'The semicolon marks the end of an instruction.', 'Statement terminator in C-like languages; optional in JavaScript/Kotlin/Swift (automatic insertion), not used in Python.', 'A missing semicolon is a syntax error in C/Java/C#; in JavaScript automatic insertion can occasionally join lines in surprising ways.', 'Exercise: find where the next instruction starts.'], simpler: ['Like a full stop: "this instruction is finished".'] }),
  C({ id: 'punct-colon', title: 'Colon', levels: ['A colon says "here comes the part that belongs to this".', 'A colon starts the body of a block (Python), separates a name from its type or value, or marks a label.', 'Colon usage depends on language: block start (Python), type annotation (TypeScript), key: value (objects, YAML), ternary else (? :).', 'In Python, forgetting the colon after if/def/for is a syntax error, and the following lines must be indented.', 'Exercise: find what comes after this colon and what it belongs to.'], simpler: ['Like in "Shopping list: milk, eggs": the colon introduces what belongs to it.'] }),
  C({ id: 'punct-dot', title: 'Dot', levels: ['The dot connects a thing with one of its parts.', 'A dot connects names: the thing on the left and a part of it on the right.', 'Member access or decimal point, depending on context.', 'See "member access".', 'Exercise: read it as "the … of …".'], simpler: ['Like "kitchen.fridge": the fridge in the kitchen.'] }),
  C({ id: 'yaml-colon', title: 'Colon (YAML)', levels: ['The colon joins a name and its value: "colour: blue".', 'In YAML, "name: value" stores a setting. Lines indented below a name belong to it.', 'YAML mappings use key: value pairs; indentation (spaces, never tabs) defines nesting.', 'Wrong indentation silently changes structure. Values like yes/no/on/off may be read as true/false in older YAML versions.', 'Exercise: find which section this setting belongs to by looking at the indentation.'], simpler: ['Like a form: "Name: Ana".'] }),
  C({
    id: 'variable-declaration',
    title: 'Creating a variable',
    levels: ['This word makes a new named box.', 'This keyword creates a new variable so the program can store a value under a name.', 'Declaration keywords (let, var, local, auto...) introduce a new variable in the current scope.', 'The keyword decides scope (block vs function vs global) and mutability. Declaring the same name twice may be an error or may shadow the earlier one.', 'Exercise: find the variable created here and where it is used.'],
    simpler: ['Like putting an empty labelled jar on a shelf.'],
  }),
  C({
    id: 'constant-declaration',
    title: 'Creating a constant',
    levels: ['This word makes a box that cannot be refilled.', 'This keyword creates a name for a value that should not change later.', 'const/final/val/readonly declare bindings that cannot be reassigned.', 'Reassigning causes an error. Objects behind such names may still be changed internally unless they are themselves immutable.', 'Exercise: try to find any place that changes it (there should be none).'],
    simpler: ['Like writing in pen instead of pencil.'],
  }),
  C({ id: 'mutable', title: 'Changeable (mut)', levels: ['"mut" means "this box may be refilled".', 'In Rust, values cannot change unless marked "mut".', 'mut makes a binding or reference mutable.', 'Rust enforces that only one mutable reference exists at a time (borrow checker).', 'Exercise: find the line that changes this value.'], simpler: ['Like writing in pencil instead of pen.'] }),
  C({
    id: 'access-modifier',
    title: 'Who may use it (access)',
    levels: ['This word says who is allowed to touch it, like a "staff only" sign.', 'This keyword controls where something can be used from: everywhere (public), only inside its class (private), and so on.', 'Access modifiers and similar keywords (public, private, protected, static, abstract, override...) control visibility and behaviour of members.', 'Making something public makes it part of what other code may depend on; making it private can break outside users. Some keywords (abstract, virtual, override) affect inheritance.', 'Exercise: find whether this member is used outside its class.'],
    simpler: ['Like rooms in a house: the living room is for guests, the bedroom is private.'],
  }),
  C({ id: 'static', title: 'Static (belongs to the class)', levels: ['Static things belong to the whole family, not to one person.', 'Static means it belongs to the class itself, shared by all objects, rather than to each object.', 'Static members exist once per class and are accessed via the class name.', 'Static state is shared across the program; changing it affects all users.', 'Exercise: find where it is used through the class name.'], simpler: ['Like a family car shared by everyone, instead of each person having their own bike.'] }),
  C({ id: 'lambda', title: 'Small unnamed function', levels: ['A tiny recipe written on the spot, without a name.', 'This creates a small function without a name, often passed to another function.', 'Lambdas/closures are anonymous function expressions, often used as callbacks.', 'They can capture variables from the surrounding code (closures); captured values may change later.', 'Exercise: find which function receives this lambda and when it is called.'], simpler: ['Like a quick note "do this" given to someone, instead of a full instruction manual.'] }),
  C({ id: 'inheritance', title: 'Building on another class', levels: ['Like a child inheriting their parent\'s eye colour.', 'This class is built on top of another one and gets its abilities automatically.', 'extends/implements/: express inheritance or interface implementation.', 'Changes in the parent class affect all children. Overridden methods replace inherited behaviour.', 'Exercise: find the parent class and list what is inherited.'], simpler: ['Like a new phone model that keeps all features of the old one and adds some.'] }),
  C({ id: 'in', title: 'In', levels: ['"In" means "inside".', '"in" either takes each item from a collection in a loop, or checks whether something is inside a collection.', 'Membership test (x in list) or iteration source (for x in list).', 'Membership on dictionaries checks keys, not values (Python). In JavaScript "for...in" goes over keys, "for...of" over values.', 'Exercise: find the collection used here.'], simpler: ['Like checking if your name is "in" the guest list.'] }),
  C({ id: 'as', title: 'As', levels: ['"As" gives another name, like a nickname.', '"as" gives something a different name here, or treats it as a certain type.', 'Aliasing in imports (import x as y), type casts (x as T), or context managers (with ... as f).', 'Type casts may fail at runtime or be unchecked. Aliases change only the local name.', 'Exercise: find the original name and the new name.'], simpler: ['Like calling "Alexander" "Alex".'] }),
  C({ id: 'yield', title: 'Hand out one value at a time', levels: ['Like a ticket machine giving one ticket each time you press.', '"yield" gives out one value and pauses until the next value is asked for.', 'Generators produce sequences lazily using yield.', 'The function\'s code runs step by step as values are requested; values are not all computed at once.', 'Exercise: list the values this generator produces.'], simpler: ['Like a pez dispenser: one sweet at a time.'] }),
  C({ id: 'pass', title: 'Do nothing (pass)', levels: ['"Pass" means "nothing to do here".', '"pass" is a placeholder that does nothing.', 'A no-op statement required where Python syntax needs a statement.', 'Often marks unfinished code.', 'Exercise: think about what should go here.'], simpler: ['Like an empty box kept as a placeholder.'] }),
  C({ id: 'delete', title: 'Remove', levels: ['This throws something away.', 'This removes a variable, an item or memory.', 'del/delete remove bindings, properties or deallocate memory.', 'Using something after deleting it causes errors (or crashes in C++).', 'Exercise: check nothing uses it afterwards.'], simpler: ['Like erasing a word from a whiteboard.'] }),
  C({ id: 'with', title: 'With (automatic clean-up)', levels: ['Like borrowing a book and the library automatically takes it back when you are done.', '"with" opens something (often a file) and makes sure it is closed again automatically.', 'Context managers (with/using) guarantee clean-up even if errors happen.', 'The resource is only valid inside the block.', 'Exercise: find what is opened and where it is closed automatically.'], simpler: ['Like a door that closes by itself after you walk through.'] }),
  C({ id: 'assert', title: 'Check (assert)', levels: ['A promise checker: "this must be true!"', 'This checks that something is true. If it is not, the program stops with an error.', 'Assertions verify assumptions during development/testing.', 'Assertions may be disabled in optimized builds (Python -O). Do not use them for user input validation.', 'Exercise: describe the assumption being checked.'], simpler: ['Like checking you have your keys before closing the door.'] }),
  C({ id: 'defer', title: 'Do this at the end (defer)', levels: ['"Do this when we are finished."', 'This line runs later, when the surrounding function ends.', 'defer schedules a call to run at function exit (Go, Swift).', 'Deferred calls run in reverse order; arguments are evaluated when defer is reached.', 'Exercise: find when the deferred action happens.'], simpler: ['Like a note "turn off the lights when leaving".'] }),
  C({ id: 'block-end', title: 'End of a block', levels: ['This closes the group that started earlier.', 'This keyword ends a block of code (a function, a condition, a loop...).', 'Block terminators (end, fi, done, esac) close constructs in languages without braces.', 'Missing or extra block ends cause syntax errors or change which lines belong to which block.', 'Exercise: find where this block started.'], simpler: ['Like "The End" at the end of a story.'] }),
  C({ id: 'output', title: 'Show output', levels: ['This shows something on the screen.', 'This prints text to the screen or console.', 'Writes to standard output (or the web page).', 'Output in servers often goes to logs. Printing secrets can leak them.', 'Exercise: predict exactly what will be shown.'], simpler: ['Like saying something out loud.'] }),
  C({ id: 'goto', title: 'Jump (goto)', levels: ['Jump to another place in the instructions.', 'goto jumps directly to a labelled place in the code.', 'Unstructured jump to a label.', 'Makes code hard to follow; skips any steps in between.', 'Exercise: find the label it jumps to.'], simpler: ['Like "go to page 42" in an adventure book.'] }),
  C({ id: 'keyword', title: 'Keyword', levels: ['This is a special word the language reserves for itself.', 'This is a reserved word of the programming language with a fixed meaning.', 'Keywords are reserved tokens that structure the program; they cannot be used as names.', 'The exact meaning depends on the language and position.', 'Exercise: look up how this keyword is used elsewhere in the file.'], simpler: ['Like words with a special meaning in a game\'s rules.'] }),
  C({ id: 'debugger', title: 'Debugger stop', levels: ['A pause button for developers.', 'When developer tools are open, the program pauses here so the developer can look inside.', 'debugger statement triggers a breakpoint.', 'Has no effect without developer tools open; usually removed before release.', 'Exercise: think about what a developer wanted to inspect here.'], simpler: ['Like a bookmark where you stop reading to think.'] }),
  // ---------------------------------------------------------------- Markup, style, data
  C({ id: 'html-tag', title: 'HTML tag (page element)', levels: ['A tag is like a label that says what something on the page is: a heading, a picture, a button.', 'HTML tags describe the parts of a web page. <p> is a paragraph, <img> an image, <button> a button. Most tags come in pairs: an opening tag and a closing tag with a slash.', 'Elements form a tree (DOM). The tag name sets the element type; attributes configure it; content goes between opening and closing tags.', 'Unclosed or misnested tags are often "repaired" silently by browsers in unpredictable ways. Scripts and styles may select elements by tag, class or id, so renaming can break them.', 'Exercise: find the closing tag for this element and describe what appears on the page.'], simpler: ['Like the labels on boxes when moving house: "kitchen", "books" — they say what is inside.'], change: 'Changing a tag changes what kind of element appears (and how it looks by default). Styles or scripts looking for this tag may stop working.' }),
  C({ id: 'html-attribute', title: 'HTML attribute (element setting)', levels: ['An attribute is a little setting on a page element, like the colour sticker on a box.', 'Attributes give extra information to an element, for example where a link goes (href) or which picture to show (src).', 'name="value" pairs in the start tag; class and id are used by CSS and JavaScript to find elements.', 'Changing class/id may break styling or scripts that refer to them. Some attributes (onclick) contain code.', 'Exercise: find whether the stylesheet or a script uses this attribute value.'], simpler: ['Like the size and colour options when ordering a T-shirt.'] }),
  C({ id: 'html-text', title: 'Page text', levels: ['These are the words people read on the page.', 'This is visible text content of the web page.', 'Text nodes inside elements.', 'Special characters must be written as entities (&lt;).', 'Exercise: change it in your head and imagine the page.'], simpler: ['Just the words shown on the page.'], change: 'Changing it only changes what people read (unless scripts look for this exact text).' }),
  C({ id: 'embedded-script', title: 'Script inside the page', levels: ['This is a little program hidden inside the web page.', 'This is JavaScript code written inside the HTML page. It runs in the browser when the page loads.', 'Inline <script> content is executed by the browser.', 'This tool does not analyse embedded scripts in detail yet: move the code to a .js file or open it separately for full explanations.', 'Exercise: find what this script changes on the page.'], simpler: ['Like a remote control built into a TV.'] }),
  C({ id: 'embedded-style', title: 'Styles inside the page', levels: ['These rules decide colours and sizes on this page.', 'CSS written directly in the HTML page.', 'Inline <style> rules apply to this document.', 'Embedded styles are not analysed in detail by this tool yet.', 'Exercise: find which elements these styles change.'], simpler: ['Like a dress code written on the invitation itself.'] }),
  C({ id: 'css-selector', title: 'CSS selector (which elements)', levels: ['A selector points at things on the page: "all buttons" or "the thing called menu".', 'The selector says which parts of the page the following style rules apply to.', 'Selectors match elements by tag, .class, #id, attributes and state (:hover).', 'Specificity decides which rule wins when several match. Renaming a class here requires renaming it in the HTML/JS too.', 'Exercise: find the HTML elements this selector matches.'], simpler: ['Like saying "everyone wearing a red hat, please stand up".'] }),
  C({ id: 'css-property', title: 'CSS property (what to change)', levels: ['This says what to change: the colour, the size, the space around…', 'A CSS property is one aspect of how something looks (color, margin, font-size).', 'property: value declarations inside a rule set.', 'Unknown properties or invalid values are ignored silently by browsers. Later rules can override earlier ones.', 'Exercise: change the value in your head and imagine the result.'], simpler: ['Like one setting on a TV: brightness, volume, contrast.'] }),
  C({ id: 'css-value', title: 'CSS value', levels: ['This is the setting: how big, which colour.', 'The value given to a style property, like a colour or a size.', 'Values with units (px, em, %), colours (#fff), keywords (auto).', 'Invalid values are ignored without an error message.', 'Exercise: try a different value in your head.'], simpler: ['Like turning the volume knob to a number.'], change: 'Changing it changes how the page looks; nothing else breaks.' }),
  C({ id: 'json-key', title: 'Data name (JSON key)', levels: ['A name with something stored next to it, like "age": 7.', 'In this data file, each value has a name (the key). Programs read values by these names.', 'JSON objects map string keys to values (strings, numbers, booleans, null, arrays, objects).', 'Programs reading this file expect exact key names; renaming a key can break them. JSON does not allow comments or trailing commas.', 'Exercise: find which program or file reads this setting.'], simpler: ['Like labels on drawers: "socks", "shirts".'], change: 'Programs look up values by these exact names: renaming can make the program ignore the setting.' }),
  C({ id: 'config-key', title: 'Setting name', levels: ['This is the name of a setting, like "volume".', 'This is the name of a setting in a configuration file. The value next to it changes how a program behaves.', 'Configuration keys (YAML/TOML/INI/.env) are read by programs or tools at start-up.', 'Exact spelling and nesting matter. Values may be read as text, numbers or booleans depending on the format. Secret values (passwords, keys) must not be shared.', 'Exercise: search the project for this setting name to find where it is used.'], simpler: ['Like a dial on a machine: the label says what it controls.'], change: 'Changing the value changes the program\'s behaviour after it restarts. Renaming the key usually makes the program fall back to a default.' }),
  C({ id: 'config-section', title: 'Settings section', levels: ['A heading that groups settings together.', 'This starts a group of settings that belong together.', 'Sections/tables ([name]) group following keys.', 'Keys belong to the nearest section above them.', 'Exercise: list the settings in this section.'], simpler: ['Like a chapter title in a manual.'] }),
  C({ id: 'xml-element', title: 'XML element', levels: ['A labelled box that can contain other boxes.', 'An XML element is a named piece of structured data, written with tags like <name>…</name>.', 'Elements form a tree; attributes add data to an element.', 'Programs reading XML expect specific element names and structure.', 'Exercise: find the closing tag of this element.'], simpler: ['Like folders inside folders.'] }),
  C({ id: 'xml-attribute', title: 'XML attribute', levels: ['A small label stuck on a box.', 'An attribute stores a value on an element, name="value".', 'Attributes are unordered name/value pairs on elements.', 'Programs read attributes by exact name.', 'Exercise: find what reads this attribute.'], simpler: ['Like the size printed on a shoe box.'] }),
  C({ id: 'markdown-heading', title: 'Heading (documentation)', levels: ['A title in a text document.', 'A Markdown heading: "#" makes a big title, "##" a smaller one.', 'ATX headings (#) create document sections.', 'Only affects how the document is displayed.', 'Exercise: find the sections of this document.'], simpler: ['Like a chapter title.'] }),
  C({ id: 'markdown-link', title: 'Link (documentation)', levels: ['A clickable link in a text document.', '[text](address) shows "text" that links to the address.', 'Inline Markdown links.', 'Broken paths lead nowhere; the tool marks links to project files.', 'Exercise: open the linked file.'], simpler: ['Like a sign pointing to another room.'] }),
  C({ id: 'sql-select', title: 'Database question (SELECT)', levels: ['Asking the database: "show me…"', 'SELECT asks the database for data: which columns, from which table, which rows.', 'SELECT queries read rows; clauses FROM, WHERE, ORDER BY, GROUP BY shape the result.', 'Large tables without WHERE/indexes can be slow. Column names must match the table.', 'Exercise: describe in words which rows and columns this query returns.'], simpler: ['Like asking a librarian for all books by one author.'] }),
  C({ id: 'sql-from', title: 'Which table (FROM / JOIN)', levels: ['"From" says which drawer to look in.', 'FROM/JOIN name the tables the data comes from.', 'Table sources and joins combine rows by matching columns.', 'Wrong join conditions can multiply rows or lose them.', 'Exercise: find the tables involved.'], simpler: ['Like choosing which filing cabinet to search.'] }),
  C({ id: 'sql-where', title: 'Filter (WHERE)', levels: ['"Where" keeps only the matching things.', 'WHERE filters rows: only rows matching the condition are used.', 'Boolean filter on rows.', 'In UPDATE/DELETE, a missing or wrong WHERE affects every row!', 'Exercise: describe which rows match.'], simpler: ['Like a sieve that lets only some things through.'] }),
  C({ id: 'sql-modify', title: 'Changing data (INSERT / UPDATE / DELETE / DROP)', levels: ['This changes what is stored in the database.', 'This statement adds, changes or deletes data — permanently, once it runs.', 'DML/DDL statements modify rows or schema.', 'These operations change stored data and are often irreversible without a backup. Understand Code never runs them.', 'Exercise: describe exactly which data would change.'], simpler: ['Like editing or throwing away files in a cabinet.'], change: 'Running a changed statement can permanently change or delete stored data.' }),
  C({ id: 'sql-create', title: 'Creating a table', levels: ['This builds a new drawer in the database.', 'CREATE makes a new table or other database object.', 'DDL defining schema objects.', 'Changing column definitions affects all queries using them.', 'Exercise: list the columns of this table.'], simpler: ['Like designing a new spreadsheet with column headings.'] }),
  C({ id: 'sql-table', title: 'Database table', levels: ['A table is like a spreadsheet inside the database.', 'This name refers to a table: data stored in rows and columns.', 'A relation in the database schema.', 'Renaming tables breaks every query using them.', 'Exercise: find all queries using this table.'], simpler: ['Like a sheet in a spreadsheet file.'] }),
  C({ id: 'cmdlet', title: 'PowerShell command', levels: ['A ready-made command, like a button with a name.', 'A PowerShell command (cmdlet) named Verb-Noun, for example Get-Item.', 'Cmdlets are commands with parameters (-Name value).', 'Some commands change the system (Remove-Item, Set-…); Understand Code never runs them.', 'Exercise: say what the verb and noun mean.'], simpler: ['Like an instruction "Get-Coffee": the verb says what, the noun says on what.'] }),
  C({ id: 'dockerfile-instruction', title: 'Container instruction', levels: ['One step in a recipe for packing an app into a box.', 'Each Dockerfile line is a step for building a container (FROM picks the starting image, RUN runs a command, COPY copies files, CMD sets the start command).', 'Dockerfile instructions build image layers.', 'Order matters for caching and size; RUN commands run during the build, CMD/ENTRYPOINT when the container starts.', 'Exercise: list the steps in order.'], simpler: ['Like steps for packing a suitcase.'] }),
  C({ id: 'plain-text', title: 'Plain text', levels: ['Just words, not instructions.', 'This file is plain text: it does not contain program code.', 'Unstructured text.', 'No analysis beyond words and numbers is possible.', 'Exercise: read it and summarise it in one sentence.'], simpler: ['Like a letter.'] }),
  C({ id: 'unknown-format', title: 'Unknown file type', levels: ['The tool does not know this kind of file yet.', 'This file type is not recognised, so only its words, numbers and brackets can be shown. Its meaning cannot be explained.', 'No language adapter matches this file; plain-text mode is used.', 'Nothing about structure or behaviour is claimed. A language adapter could be added later.', 'Exercise: look at the file extension and find out which program uses such files.'], simpler: ['Like a book in a language you cannot read: you can see the letters, but not the meaning.'] }),
  C({ id: 'unknown', title: 'Something without a specific explanation', levels: ['The tool is not sure what this is.', 'There is no specific explanation for this part yet. You can still see its name in the language\'s syntax tree.', 'An uncommon syntax construct without a knowledge base entry.', 'Shown with its raw syntax node type so you can look it up.', 'Exercise: click the surrounding words for more context.'], simpler: ['Even the tool does not have a simple answer here — that is okay. Try clicking nearby words.'] }),
];

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: string): Concept {
  if (BY_ID.has(id)) return BY_ID.get(id)!;
  if (id.startsWith('bracket-')) return BY_ID.get('bracket')!;
  if (id.startsWith('operator-')) return BY_ID.get('operator-other')!;
  if (id.startsWith('dockerfile-')) return BY_ID.get('dockerfile-instruction')!;
  return BY_ID.get('unknown')!;
}

export function hasConcept(id: string): boolean {
  return BY_ID.has(id);
}

/** Plain explanations of what different bracket pairs enclose. */
export const BRACKET_CONSTRUCTS: Record<string, string> = {
  'call-arguments': 'These brackets hold the information given to a function when it is used (the "arguments").',
  parameters: 'These brackets hold the list of inputs a function expects (its "parameters").',
  'function-body': 'These braces hold the body of a function: all the steps it performs.',
  block: 'These braces group lines that belong together, for example the steps of an if or a loop.',
  'if-body': 'These braces hold the steps that run only when the "if" condition is true.',
  'loop-body': 'These braces hold the steps that are repeated by the loop.',
  'class-body': 'These braces hold everything that belongs to a class or structure: its data and its functions.',
  'try-body': 'These braces hold steps that are protected against errors (or the steps that handle an error).',
  'switch-body': 'These braces hold the different cases of a choice.',
  list: 'Square brackets make a list: several values in order, like a shopping list.',
  object: 'These braces make an object: a group of named values (name: value).',
  index: 'Square brackets after a name pick one item from a list or table by its position or key.',
  grouping: 'Round brackets group things: the part inside is worked out first, or it is a condition being checked.',
  template: '${ } inserts a value into a piece of text.',
  'type-arguments': 'Angle brackets give type information: what kind of data is used inside.',
  tuple: 'Round brackets make a small fixed group of values.',
  'css-block': 'These braces hold the style rules for the selector in front of them.',
};
