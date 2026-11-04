// Keyword and operator dictionaries. Each keyword maps to a concept in the knowledge base plus a
// short meaning; language-specific entries override the general ones.

interface KeywordEntry {
  concept: string;
  meaning: string;
}

const K = (concept: string, meaning: string): KeywordEntry => ({ concept, meaning });

const GENERAL: Record<string, KeywordEntry> = {
  if: K('if', '"if" checks a condition. The lines that belong to it run only when the condition is true.'),
  else: K('else', '"else" means "otherwise": these lines run when the "if" condition was false.'),
  elif: K('else', '"elif" means "else if": check another condition when the previous one was false.'),
  elsif: K('else', '"elsif" means "else if": check another condition when the previous one was false.'),
  elseif: K('else', '"elseif" means "else if": check another condition when the previous one was false.'),
  then: K('if', '"then" marks the start of what happens when the condition is true.'),
  unless: K('if', '"unless" is the opposite of "if": the lines run only when the condition is false.'),
  for: K('loop-for', '"for" starts a loop: the same steps are repeated, usually once for each item in a list or for a range of numbers.'),
  foreach: K('loop-for', '"foreach" repeats the same steps once for each item in a collection.'),
  while: K('loop-while', '"while" repeats the steps as long as a condition stays true.'),
  until: K('loop-while', '"until" repeats the steps until a condition becomes true.'),
  do: K('loop-while', '"do" marks the start of the steps to repeat (or a block of steps).'),
  loop: K('loop-while', '"loop" repeats the steps forever until something stops it (for example "break").'),
  break: K('break', '"break" stops the loop immediately and continues after it.'),
  continue: K('continue', '"continue" skips the rest of this round of the loop and starts the next round.'),
  return: K('return', '"return" ends the function and gives a result back to whoever called it.'),
  function: K('function', '"function" starts the definition of a function: a named set of steps that can be reused.'),
  def: K('function', '"def" (define) starts the definition of a function: a named set of steps that can be reused.'),
  fn: K('function', '"fn" starts the definition of a function in Rust.'),
  func: K('function', '"func" starts the definition of a function.'),
  fun: K('function', '"fun" starts the definition of a function in Kotlin.'),
  sub: K('function', '"sub" starts a subroutine (a function).'),
  lambda: K('lambda', '"lambda" creates a small function without a name, written in one line.'),
  class: K('class', '"class" starts the definition of a class: a blueprint for creating objects that hold data and behaviour together.'),
  struct: K('struct', '"struct" defines a structure: a named group of related values.'),
  enum: K('enum', '"enum" defines a fixed list of named options (for example Red, Green, Blue).'),
  interface: K('interface', '"interface" describes which functions or fields something must have, without saying how they work.'),
  trait: K('interface', '"trait" describes shared behaviour that types can provide (Rust/PHP).'),
  protocol: K('interface', '"protocol" describes which functions or properties a type must provide (Swift).'),
  type: K('type-keyword', '"type" gives a name to a kind of data.'),
  impl: K('class', '"impl" adds functions (methods) to a type in Rust.'),
  extends: K('inheritance', '"extends" means this class is built on top of another class and inherits its abilities.'),
  implements: K('inheritance', '"implements" promises that this class provides everything an interface requires.'),
  import: K('import', '"import" brings in code from another file or library so it can be used here.'),
  from: K('import', '"from" says which file or library to bring things in from.'),
  export: K('export', '"export" makes something available to other files.'),
  require: K('import', '"require" loads code from another file or library.'),
  include: K('import', '"include" pastes in the contents of another file.'),
  using: K('import', '"using" makes names from another namespace or library available here.'),
  use: K('import', '"use" brings names from another module or library into this file.'),
  package: K('namespace', '"package" says which group (package) this file belongs to.'),
  namespace: K('namespace', '"namespace" groups related names together to avoid name clashes.'),
  module: K('namespace', '"module" groups related code together.'),
  mod: K('namespace', '"mod" declares a module (a group of code, often a separate file) in Rust.'),
  const: K('constant-declaration', '"const" creates a name for a value that is not supposed to be changed later.'),
  let: K('variable-declaration', '"let" creates a new variable: a named box that holds a value.'),
  var: K('variable-declaration', '"var" creates a new variable: a named box that holds a value.'),
  val: K('constant-declaration', '"val" creates a name for a value that cannot be reassigned (Kotlin).'),
  local: K('variable-declaration', '"local" creates a variable that exists only inside this function or block.'),
  mut: K('mutable', '"mut" (mutable) allows this value to be changed later. Without it, Rust values cannot change.'),
  final: K('constant-declaration', '"final" means it cannot be changed (or overridden) afterwards.'),
  readonly: K('constant-declaration', '"readonly" means the value can be set once but not changed afterwards.'),
  static: K('static', '"static" means it belongs to the class itself, not to each individual object.'),
  public: K('access-modifier', '"public" means it can be used from anywhere, including other files and classes.'),
  private: K('access-modifier', '"private" means it can only be used inside this class (or file).'),
  protected: K('access-modifier', '"protected" means it can be used in this class and classes built on top of it.'),
  internal: K('access-modifier', '"internal" means it can only be used inside this project/module.'),
  pub: K('access-modifier', '"pub" (public) makes it usable from outside this module (Rust).'),
  abstract: K('access-modifier', '"abstract" means it is incomplete on purpose: other classes must fill in the details.'),
  virtual: K('access-modifier', '"virtual" allows classes built on this one to replace this function.'),
  override: K('access-modifier', '"override" replaces a function that was inherited from a parent class.'),
  async: K('async', '"async" marks a function that can wait for slow things (like downloads) without freezing the program.'),
  await: K('async', '"await" waits here until a slow operation (like reading a file or a network request) finishes.'),
  try: K('try', '"try" runs some steps while watching for errors, so they can be handled instead of crashing the program.'),
  catch: K('try', '"catch" contains the steps that run when an error happened in the "try" part.'),
  except: K('try', '"except" contains the steps that run when an error happened in the "try" part (Python).'),
  finally: K('try', '"finally" contains steps that always run at the end, whether an error happened or not.'),
  rescue: K('try', '"rescue" handles an error (Ruby).'),
  ensure: K('try', '"ensure" contains steps that always run at the end (Ruby).'),
  throw: K('throw', '"throw" signals an error: the program stops this path and looks for code that handles the error.'),
  raise: K('throw', '"raise" signals an error: the program stops this path and looks for code that handles the error.'),
  new: K('new', '"new" creates a new object from a class (a blueprint).'),
  this: K('self-reference', '"this" means "the current object" — the object that is running this function.'),
  self: K('self-reference', '"self" means "the current object" — the object that is running this function.'),
  super: K('self-reference', '"super" refers to the parent class this class is built on.'),
  true: K('boolean', '"true" is the yes-value of a yes/no (boolean) value.'),
  false: K('boolean', '"false" is the no-value of a yes/no (boolean) value.'),
  null: K('null', '"null" means "nothing here" — an empty value.'),
  nil: K('null', '"nil" means "nothing here" — an empty value.'),
  None: K('null', '"None" means "nothing here" — an empty value (Python).'),
  undefined: K('null', '"undefined" means "no value has been given yet" (JavaScript).'),
  True: K('boolean', '"True" is the yes-value (Python).'),
  False: K('boolean', '"False" is the no-value (Python).'),
  and: K('operator-logical', '"and" is true only when both sides are true.'),
  or: K('operator-logical', '"or" is true when at least one side is true.'),
  not: K('operator-logical', '"not" turns true into false and false into true.'),
  in: K('in', '"in" checks whether something is inside a collection, or takes each item from it in a loop.'),
  of: K('in', '"of" takes each item from a collection in a loop (JavaScript "for ... of").'),
  is: K('operator-comparison', '"is" checks whether two things are the same object (or of a certain type).'),
  as: K('as', '"as" gives something another name, or treats it as a certain type.'),
  switch: K('switch', '"switch" chooses one of several paths depending on a value.'),
  case: K('switch', '"case" is one of the options in a switch: these lines run when the value matches.'),
  default: K('switch', '"default" is the option used when no other case matches.'),
  match: K('switch', '"match" compares a value against several patterns and runs the first that fits.'),
  when: K('switch', '"when" chooses one of several paths depending on a value (Kotlin/Ruby).'),
  yield: K('yield', '"yield" hands out one value at a time and pauses until the next value is asked for.'),
  pass: K('pass', '"pass" means "do nothing here". It is a placeholder where Python requires at least one line.'),
  del: K('delete', '"del" removes a variable or an item.'),
  delete: K('delete', '"delete" removes something (a property of an object, or memory in C++).'),
  typeof: K('operator-type', '"typeof" tells what kind of value something is (number, text, ...).'),
  instanceof: K('operator-type', '"instanceof" checks whether an object was created from a certain class.'),
  void: K('type-keyword', '"void" means "no value": a function marked void does not give anything back.'),
  with: K('with', '"with" sets something up for a group of lines and cleans it up afterwards (for example closing a file).'),
  global: K('variable-declaration', '"global" says this name refers to the variable at the top level of the file, not a local one.'),
  nonlocal: K('variable-declaration', '"nonlocal" says this name refers to a variable of the surrounding function.'),
  assert: K('assert', '"assert" checks that something is true; if it is not, the program stops with an error.'),
  go: K('async', '"go" starts a function running at the same time as the rest of the program (a goroutine).'),
  defer: K('defer', '"defer" schedules this line to run when the surrounding function finishes.'),
  chan: K('type-keyword', '"chan" is a channel: a pipe for passing values between parts of a Go program running at the same time.'),
  where: K('type-keyword', '"where" adds conditions (requirements) to types or to a database query.'),
  end: K('block-end', '"end" closes the block that was opened earlier (function, if, loop, class...).'),
  begin: K('block-end', '"begin" opens a block of steps.'),
  echo: K('output', '"echo" prints text to the screen or into the page.'),
  print: K('output', '"print" shows text on the screen (in the console).'),
  goto: K('goto', '"goto" jumps directly to another labelled place in the code.'),
  sizeof: K('operator-type', '"sizeof" tells how much memory something uses.'),
  typedef: K('type-keyword', '"typedef" gives a new name to an existing type.'),
  inline: K('access-modifier', '"inline" is a hint to place the function\'s code directly where it is used, for speed.'),
  unsafe: K('access-modifier', '"unsafe" marks code that skips some of the language\'s safety checks; mistakes here can crash the program.'),
  extern: K('access-modifier', '"extern" says the thing is defined elsewhere (another file or library).'),
  register: K('access-modifier', '"register" is an old hint to keep a variable in a fast processor register.'),
  volatile: K('access-modifier', '"volatile" tells the compiler this value may change unexpectedly (for example by hardware).'),
  synchronized: K('access-modifier', '"synchronized" lets only one part of the program run this at a time.'),
  operator: K('function', '"operator" defines how a symbol like + works for a custom type.'),
  template: K('type-keyword', '"template" makes code that works with many types (C++ generics).'),
  typename: K('type-keyword', '"typename" says the following name is a type (C++ templates).'),
  auto: K('variable-declaration', '"auto" lets the compiler figure out the type from the value.'),
  int: K('type-keyword', '"int" is the type for whole numbers.'),
  float: K('type-keyword', '"float" is the type for decimal numbers.'),
  double: K('type-keyword', '"double" is the type for precise decimal numbers.'),
  char: K('type-keyword', '"char" is the type for a single character.'),
  bool: K('type-keyword', '"bool" is the type for yes/no (true/false) values.'),
  string: K('type-keyword', '"string" is the type for text.'),
  get: K('property', '"get" defines how a value is read.'),
  set: K('property', '"set" defines how a value is changed.'),
  local_function: K('function', ''),
  source: K('import', '"source" runs another shell file inside this one.'),
  fi: K('block-end', '"fi" ("if" backwards) closes an if-block in shell scripts.'),
  done: K('block-end', '"done" closes a loop in shell scripts.'),
  esac: K('block-end', '"esac" ("case" backwards) closes a case-block in shell scripts.'),
  exit: K('return', '"exit" stops the whole script and returns a status code (0 means success).'),
  debugger: K('debugger', '"debugger" pauses the program here when developer tools are open.'),
};

const OVERRIDES: Record<string, Record<string, KeywordEntry>> = {
  python: {
    from: K('import', '"from ... import ..." brings specific things in from another module (file or library).'),
    in: K('in', 'In a "for" loop, "in" takes each item from the collection one by one. Elsewhere it checks whether something is inside a collection.'),
    with: K('with', '"with" opens something (often a file) and makes sure it is closed again automatically.'),
  },
  javascript: {
    const: K('constant-declaration', '"const" creates a name for a value. The name cannot be pointed at a different value later (but objects inside can still change).'),
    let: K('variable-declaration', '"let" creates a variable that exists only inside the nearest { } block.'),
    var: K('variable-declaration', '"var" is the older way to create a variable; it exists in the whole function.'),
    function: K('function', '"function" creates a function: a named, reusable set of steps.'),
  },
  rust: {
    let: K('variable-declaration', '"let" creates a variable. In Rust it cannot change unless "mut" is added.'),
    use: K('import', '"use" brings names from another module or crate (library) into scope.'),
    match: K('switch', '"match" compares a value against patterns; Rust checks that every possibility is handled.'),
  },
  go: {
    var: K('variable-declaration', '"var" creates a variable.'),
    type: K('type-keyword', '"type" defines a new kind of data (for example a struct).'),
    range: K('loop-for', '"range" goes through each item of a list, map or string in a for loop.'),
    package: K('namespace', '"package" names the group this file belongs to. "package main" means this is a runnable program.'),
  },
  bash: {
    then: K('if', '"then" marks the start of the commands that run when the condition is true.'),
    do: K('loop-for', '"do" marks the start of the commands repeated by the loop.'),
    in: K('in', '"in" lists the items the loop goes through.'),
    local: K('variable-declaration', '"local" creates a variable that exists only inside this function.'),
    export: K('export', '"export" makes a variable available to programs started from this script.'),
  },
  ruby: {
    def: K('function', '"def" defines a method (a function).'),
    end: K('block-end', '"end" closes the block opened by def, class, if, do, etc.'),
    module: K('namespace', '"module" groups related methods and constants together.'),
  },
  lua: {
    local: K('variable-declaration', '"local" creates a variable visible only inside this block or function. Without it, the variable is global (visible everywhere).'),
    end: K('block-end', '"end" closes the block opened by function, if, for, while or do.'),
  },
  sql: {
    select: K('sql-select', 'SELECT asks the database for data: which columns you want to see.'),
    from: K('sql-from', 'FROM says which table the data comes from.'),
    where: K('sql-where', 'WHERE filters the rows: only rows matching the condition are used.'),
    insert: K('sql-modify', 'INSERT adds new rows to a table.'),
    update: K('sql-modify', 'UPDATE changes values in existing rows.'),
    delete: K('sql-modify', 'DELETE removes rows from a table. Without WHERE it removes all rows!'),
    create: K('sql-create', 'CREATE makes a new table, view, index or other database object.'),
    table: K('sql-create', 'TABLE refers to a database table: data stored in rows and columns.'),
    join: K('sql-from', 'JOIN combines rows from two tables that belong together.'),
    order: K('sql-select', 'ORDER BY sorts the results.'),
    group: K('sql-select', 'GROUP BY puts rows with the same value together, usually to count or sum them.'),
    drop: K('sql-modify', 'DROP permanently deletes a table or other database object.'),
  },
  css: {},
};

export function keywordEntry(lang: string, word: string): KeywordEntry | undefined {
  const key = lang === 'sql' || lang === 'powershell' || lang === 'batch' || lang === 'dockerfile' ? word.toLowerCase() : word;
  const fam = lang === 'typescript' || lang === 'tsx' ? 'javascript' : lang;
  return OVERRIDES[fam]?.[key] ?? GENERAL[key] ?? GENERAL[key.toLowerCase()];
}

export function keywordConcept(lang: string, word: string, parentType = ''): string {
  const e = keywordEntry(lang, word);
  if (e) return e.concept;
  if (/^(public|private|protected)/.test(parentType)) return 'access-modifier';
  return 'keyword';
}

export function keywordMeaning(lang: string, word: string): string | undefined {
  const e = keywordEntry(lang, word);
  if (e && e.meaning) return e.meaning;
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Operators

export interface OperatorEntry {
  name: string;
  meaning: string;
  /** Plausible replacements to suggest in "what if I change this?". */
  alternatives: string[];
}

export const OPERATORS: Record<string, OperatorEntry> = {
  '+': { name: 'plus', meaning: 'adds two numbers together (or joins two pieces of text)', alternatives: ['-', '*'] },
  '-': { name: 'minus', meaning: 'subtracts the right number from the left one (or makes a number negative)', alternatives: ['+'] },
  '*': { name: 'times', meaning: 'multiplies two numbers', alternatives: ['/', '+'] },
  '/': { name: 'divided by', meaning: 'divides the left number by the right one', alternatives: ['*', '//'] },
  '//': { name: 'whole-number division', meaning: 'divides and drops the remainder (Python)', alternatives: ['/'] },
  '%': { name: 'remainder (modulo)', meaning: 'gives what is left over after dividing (e.g. 7 % 3 is 1)', alternatives: ['/'] },
  '**': { name: 'power', meaning: 'raises a number to a power (e.g. 2 ** 3 is 8)', alternatives: ['*'] },
  '=': { name: 'assignment', meaning: 'stores the value on the right into the name on the left. It does NOT mean "is equal to"', alternatives: [] },
  ':=': { name: 'short assignment', meaning: 'creates a variable and stores a value in it at the same time', alternatives: ['='] },
  '+=': { name: 'add and store', meaning: 'adds the right value to the variable on the left and stores the result back in it', alternatives: ['-=', '='] },
  '-=': { name: 'subtract and store', meaning: 'subtracts the right value from the variable and stores the result back', alternatives: ['+=', '='] },
  '*=': { name: 'multiply and store', meaning: 'multiplies the variable by the right value and stores the result back', alternatives: ['/=', '='] },
  '/=': { name: 'divide and store', meaning: 'divides the variable by the right value and stores the result back', alternatives: ['*=', '='] },
  '==': { name: 'is equal to', meaning: 'checks whether both sides are equal; gives true or false', alternatives: ['!=', '==='] },
  '===': { name: 'is exactly equal to', meaning: 'checks whether both sides are equal AND of the same kind (JavaScript); gives true or false', alternatives: ['!==', '=='] },
  '!=': { name: 'is not equal to', meaning: 'checks whether both sides are different; gives true or false', alternatives: ['=='] },
  '!==': { name: 'is not exactly equal to', meaning: 'checks whether both sides differ in value or kind; gives true or false', alternatives: ['==='] },
  '<>': { name: 'is not equal to', meaning: 'checks whether both sides are different (SQL)', alternatives: ['='] },
  '<': { name: 'is less than', meaning: 'checks whether the left side is smaller than the right side', alternatives: ['<=', '>'] },
  '>': { name: 'is greater than', meaning: 'checks whether the left side is bigger than the right side', alternatives: ['>=', '<'] },
  '<=': { name: 'is less than or equal to', meaning: 'checks whether the left side is smaller than or the same as the right side', alternatives: ['<', '>='] },
  '>=': { name: 'is greater than or equal to', meaning: 'checks whether the left side is bigger than or the same as the right side', alternatives: ['>', '<='] },
  '&&': { name: 'and', meaning: 'is true only when both sides are true', alternatives: ['||'] },
  '||': { name: 'or', meaning: 'is true when at least one side is true (in JavaScript also: use the right side if the left is empty)', alternatives: ['&&', '??'] },
  '!': { name: 'not', meaning: 'turns true into false and false into true', alternatives: [] },
  '??': { name: 'otherwise (if empty)', meaning: 'uses the right side only when the left side is null or undefined', alternatives: ['||'] },
  '?': { name: 'question mark', meaning: 'starts a short if/else: condition ? value-if-true : value-if-false (or marks something optional)', alternatives: [] },
  '.': { name: 'dot (member access)', meaning: 'opens up the thing on the left and takes the named part on the right (like "car.color")', alternatives: [] },
  '?.': { name: 'optional member access', meaning: 'like a dot, but gives "undefined" instead of an error when the left side is empty', alternatives: ['.'] },
  '->': { name: 'arrow', meaning: 'accesses a member through a pointer (C/C++/PHP), or shows a return type', alternatives: [] },
  '=>': { name: 'fat arrow', meaning: 'connects inputs to a result: in JavaScript it creates a short function; elsewhere it maps a key to a value', alternatives: [] },
  '::': { name: 'scope operator', meaning: 'reaches into a namespace, class or module to get something inside it', alternatives: [] },
  '++': { name: 'increment', meaning: 'adds 1 to the variable', alternatives: ['--'] },
  '--': { name: 'decrement', meaning: 'subtracts 1 from the variable', alternatives: ['++'] },
  '&': { name: 'ampersand', meaning: 'bitwise AND, or "the address of" a variable (C/C++), or a reference (Rust)', alternatives: [] },
  '|': { name: 'pipe / bitwise or', meaning: 'in shell scripts it sends the output of one command into the next; elsewhere bitwise OR', alternatives: [] },
  '^': { name: 'caret', meaning: 'bitwise exclusive OR (XOR) in most languages', alternatives: [] },
  '~': { name: 'tilde', meaning: 'bitwise NOT, or "home folder" in file paths', alternatives: [] },
  '<<': { name: 'shift left', meaning: 'shifts bits left (multiplies by 2 per step), or writes into a stream (C++)', alternatives: ['>>'] },
  '>>': { name: 'shift right / append', meaning: 'shifts bits right; in shell scripts it appends output to a file', alternatives: ['<<'] },
  '...': { name: 'spread', meaning: 'spreads out all items of a list or object here', alternatives: [] },
  '..': { name: 'range / concatenate', meaning: 'a range of numbers (Rust/Swift) or joins text (Lua)', alternatives: [] },
  '@': { name: 'at sign', meaning: 'a decorator (Python), matrix multiplication, or an annotation (Java)', alternatives: [] },
  '#': { name: 'hash', meaning: 'often starts a comment or a preprocessor instruction', alternatives: [] },
};

/** Category used to pick a concept explanation for an operator. */
export function operatorCategory(sym: string, parentType: string): string {
  if (/^(=|:=)$/.test(sym)) return 'assignment';
  if (/^[+\-*/%&|^]=$|^\*\*=$|^\/\/=$|^<<=$|^>>=$|^\?\?=$|^&&=$|^\|\|=$/.test(sym)) return 'compound-assignment';
  if (/^(==|===|!=|!==|<>|<=|>=)$/.test(sym)) return 'comparison';
  if ((sym === '<' || sym === '>') && !/type|tag|template|generic/.test(parentType)) return 'comparison';
  if (/^(&&|\|\||!|\?\?|and|or|not)$/.test(sym)) return 'logical';
  if (/^(\+|-|\*|\/|%|\*\*|\/\/)$/.test(sym)) return parentType.includes('unary') ? 'unary' : 'arithmetic';
  if (/^(\+\+|--)$/.test(sym)) return 'increment';
  if (/^(\.|\?\.|->|::)$/.test(sym)) return 'member';
  if (sym === '?' && /ternary|conditional/.test(parentType)) return 'ternary';
  if (sym === '=>' && /arrow/.test(parentType)) return 'arrow';
  if (sym === '|' && /pipeline/.test(parentType)) return 'pipe';
  if (/^(>|>>|<|&>|2>)$/.test(sym) && /redirect/.test(parentType)) return 'redirect';
  if (sym === '...') return 'spread';
  return 'other';
}
