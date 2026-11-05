# UNDERSTAND CODE — user guide and capabilities

"Understand Code" is a second tool inside Material Foundry for people who are not programmers (and for anyone
who finds code stressful). Open a project, click on anything you do not understand, and get a calm explanation
in plain words. Switch to it with the **UNDERSTAND CODE** button in the top bar; **Materials** brings you back to
the texture studio, which is unchanged.

Everything runs in your browser on your own computer. There is no account, no internet connection, no cloud AI
service and no API key involved. (An AI model running on your own computer can optionally be connected.)

## New: "Shooter from zero" — learn Unity C# by playing (ninth iteration)

* The main entry on the start screen. Code on the left, a **3D first-person game** on the right (three.js, loaded
  only when opened). 25 missions in 5 chapters bring a soldier's "suit" back to life: comms, legs, eyes, body,
  jump, sprint/crouch → raycast weapon, damage, magazine, automatic fire, shotgun, weapon classes → bot patrol,
  bot eyes, bot brain (state machine) → atmosphere (inertia, head bob, FOV kick, leaning, weapon sway/recoil,
  procedural walking) → a full match on the map "Dusty Yard" (you + 2 allies vs 5 bots).
* Every mission has 1–5 highlighted blanks `___`, a radio briefing, new words with plain explanations, progressive
  hints, "show me how to play" (the game plays itself with *your* code), the 5-lines reader, and "the same in real
  Unity". Goals are checked inside the game. Mission 1 starts on a soft light-grey screen.
* Free play opens the whole finished game with all 8 scripts editable.
* Details and the test evidence: `docs/RU_GUIDE.md` §4½ and `VERIFICATION.md` §12.

## Earlier: fifth iteration (write, run, play)

* **Workshop** — a code editor (CodeMirror 6) with three layers of help: (1) suggestions with a plain-language
  explanation of every word, Unity-aware after a dot (`transform.`, `Input.`, `rb.` → `AddForce`… using the
  variable's declared type); (2) **"what comes next"** — grey ghost text from the usual shape of Unity scripts,
  console C#, Python and JavaScript (Tab accepts, Esc hides), each guess with the reason it is likely;
  (3) a live explanation of the word under the cursor. **Live checks with one-click fixes** for beginner and Unity
  mistakes the engine does not explain (lowercase `update` is silently never called, CS1612 `position.x`, `=` in a
  condition, `if (…);`, missing `f`, movement without `Time.deltaTime`, `GetComponent` in `Update`, wrong 2D/3D
  collider types, class/file name mismatch, `new` on a MonoBehaviour…), plus grammar errors from Tree-sitter.
  **"I want…"**: 38 explained recipes found from free-text wishes in Russian or English (jump, coins, camera follow,
  shooting, enemies, saving, UI, Unreal, C++, Python…), each with editor setup steps.
* **Safe Run** — only for code written in the Workshop and only when *Run* is pressed. C# runs in an own
  step-by-step interpreter (with `Console.ReadLine` answers); Python is real CPython (Pyodide, bundled, offline) in a
  worker without network functions; JavaScript runs in a worker without network/storage functions and is stopped
  after 4 s. Endless loops are stopped and explained. **Step-by-step replay** of the real run: current line, boxes
  with real values (changed ones highlighted), call stack, screen output. C and C++ are honestly not run.
* **Mini-Unity** — write real Unity C# MonoBehaviour scripts and watch them drive a small 2D world: 14 levels
  (Start/Debug.Log → Update/transform/deltaTime → Input → triggers/CompareTag/Destroy → GetAxis → Rigidbody2D jump →
  Instantiate → timer → final), Inspector with the script's public fields, Console with `Debug.Log`, keyboard and
  touch controls, hints and solutions; a sandbox for any Workshop script. **All 27 Unity recipes run in the sandbox
  and are checked by behaviour** (`tests/unity-recipes.test.ts`): coroutines with `WaitForSeconds`, `Invoke`,
  rotation and mirroring, mouse input and `ScreenToWorldPoint`, `Physics2D.OverlapCircle`/`Raycast`,
  `Debug.DrawRay`, `GameObject.FindWithTag`, `CharacterController`, `Animator`, `AudioSource`, `SpriteRenderer`,
  `Time.timeScale`, `SceneManager.LoadScene`, `PlayerPrefs`, UI text and sliders, delayed `Destroy`, trigger
  enter/stay/exit. Scripts go onto the object their class name suggests; empty Inspector fields are filled with
  sensible objects and each choice is written to the Console. Every level's solution is played
  automatically by the tests.
* **Courses** — *C# for Unity* (16 lessons; every example runs for real in the replay; tasks are checked by running
  the learner's code and comparing the output) and *Unreal Engine C++* (4 reading lessons compared with Unity).
  "Compare with other languages" shows a lesson's code in all languages side by side.
* **Trainers** — *Find the bug* (26 real Unity mistakes, from the symptom to the line; every case is checked by the
  tests, and the ones the live checks know are flagged on exactly that line), *What will it print?* (endless questions
  from 15 templates with random numbers; the right answer comes from running the code, each wrong option explains its
  misconception; step-by-step replay), *Unity event order*, *Where does this code go?*, a printable *Unity C# cheat
  sheet*, 18 achievements and a daily XP goal.
* **Course "C# further (part 2)"** — 9 lessons with tasks: static, struct vs class (why Vector3 is copied and CS1612),
  interfaces, Action/Func, events, generics, ?. ?? ??=, const/readonly, Dictionary loops. The interpreter now copies
  structs on assignment, supports multicast delegates (+=, -=), `event` fields and `x?.Method()` calls.
* **"Project: your own platformer"** — 5 Mini-Unity steps that grow one script into a small game (walk → jump with a
  ground ray → coins → stomp the enemy → win message); each step is played automatically by the tests.
* **More Unity**: 50 recipes (39 of them Unity scripts, all playing in Mini-Unity and checked by behaviour) and
  14 Mini-Unity levels (new: coroutine, InvokeRepeating, ground raycast, FindWithTag, arrays/foreach).
* **Error translator** — paste Unity Console / Visual Studio / compiler / Python / browser errors; 52 known kinds
  are explained (meaning + fix, file and line).
* **Memory & focus** — spaced repetition (Leitner boxes 1/2/4/8/16 days) from lesson questions and the notebook;
  ⭐ notebook with Markdown export; "continue where you stopped"; focus timer with gentle breaks; read-aloud with the
  system voices; an easy-reading font (PT Sans with wider spacing).
* **Optional local AI** — Ollama or an OpenAI-compatible local server (LM Studio, llama.cpp, Jan); only localhost
  addresses are accepted; answers are always marked as guesses and inserted only on click. See
  [LOCAL_AI.md](LOCAL_AI.md).
* **Desktop app with a Windows installer** (Electron + NSIS: folder choice, shortcuts, uninstaller) — see
  [DESKTOP.md](DESKTOP.md).

## Earlier: fourth iteration

* **Russian and English interface** (Settings → Language; Russian is chosen automatically on Russian systems). The
  whole knowledge base, explanations, what-if proposals and project overview exist in both languages; a test fails
  if any idea, keyword or operator is missing a Russian text, or if an explanation in Russian still contains an
  English sentence.
* **Step-by-step guide**: a one-line helper at the top always says what to do next and highlights the place to
  click. Panels are shown only when they help (the explanation panel only while reading code).
* **Learn**: 8 short game-themed lessons (variables → if → for → game loop → functions → lists → objects →
  pointers) in C#, C++, C, Python and JavaScript. Each lesson: one idea, a step-by-step animation of the running
  program (current line, boxes with values, "where are we now" call stack, screen output), then 3–4 mini-games
  (predict the output, find the mistake by tapping it, put the lines in order). XP, levels, stars and a day
  streak are kept in the browser. The C, C++, Python and JavaScript versions are compiled and run by the tests
  to prove the animations show what the programs really print.
* **"Show me step by step"** for real code: walks through a function's steps and highlights each line (nothing
  is run).
* **Deeper C, C++ and C#** and game engines: pointers, address-of, `->`, `::`, preprocessor, memory
  (`new`/`delete`, `malloc`/`free`), destructors, `virtual`/`override`, references, templates, C# properties,
  events, nullable types, LINQ, `main`; Unity callbacks (`Start`, `Update`, `OnCollisionEnter` …), Unreal macros and
  `BeginPlay`/`Tick`, vectors, lists and dictionaries; meanings of well-known library functions (printf, malloc,
  std::cout, Console.WriteLine, Debug.Log, Instantiate, GetComponent, Time.deltaTime …) phrased as "if this is …"
  and marked *Likely*. Unity and Unreal projects are recognised in the project overview.
* **Portable download**: `release/MaterialFoundry-portable.zip` with launchers for Windows (PowerShell, nothing to
  install), macOS and Linux (Python 3 or Node.js). They serve the app on 127.0.0.1 only.

## Safety promises

* **Opening never runs anything.** Files are read as text only. Project scripts (for example `npm` scripts in a
  `package.json`) are listed for information and never executed. The module has no code-execution feature at all.
* **Your originals are protected.** Every change happens in a protected copy inside the app (stored in the
  browser's IndexedDB). Files on disk change only when you press *Save to my folder…* and confirm — and before
  writing, a copy of each file is saved into `.understand-code-backups/<date-time>/` in your project. A file that
  was changed by another program after you opened it is skipped instead of overwritten.
* **Nothing is applied without your "yes".** "What if I change this?" shows a preview first; applying requires
  ticking *I have looked at the preview and the risks* and pressing *Yes, apply this change*.
* **A restore point is saved before every change.** Undo, redo, going back to a restore point and "Back to
  original" are all available, and none of them loses information (going back is itself a change that can be
  undone).
* **Honesty.** Every statement about your code is marked **Verified** (read from the code structure), **Likely**
  (based on names and patterns), **Assumption** (a guess from conventions) or **Unknown** (cannot be known without
  running the program). The app never claims a change is "safe"; it reports what it checked and what it could not.

## How to use it

1. **Open something**: *Open a folder*, *Open files*, drag files/folders onto the window, or *Try an example*
   (a small shop project in Python, JavaScript, HTML, CSS, YAML and SQL). Dependency and build folders
   (`node_modules`, `.git`, `dist`, …) are skipped; binary files are listed but not opened.
2. **Project explained** gives an everyday summary: what kind of project it is, where it starts, the most important
   files, the main parts and how they talk to each other, settings files, outside libraries, commands the authors
   defined, and what cannot be known from the files alone.
3. **Click any word, symbol, bracket or operator** in the code. The panel on the right explains what it is, what
   it does here, where it is made and used, and what would happen if it changed.
4. **Choose the level** (keys 1–5): *Like I'm 5*, *Beginner*, *Technical*, *Deep*, *Teach me* (a guided exercise
   with a question and a hidden answer). The choice applies instantly and is remembered.
5. **I don't understand** (key `?`) explains it again in a different, simpler way each time you press it.
   **Show me with an example** (key `e`) shows a small example of the same idea.
6. **Pictures**: *Steps* (flowchart of a function or file), *Functions* (who uses it / what it uses), *Data*
   (where a value is created, changed and read), *Files* (which files use this one / what it needs). The
   **Project map** tab shows the whole project's file connections.
7. **What if I change this?** (key `w`): (1) what it does now, (2) choose a goal in simple words — change a value,
   switch a boolean, use a different operator, rename everywhere, switch a line off, delete a line, or write your
   own line — (3) preview: the smallest edit, a before/after comparison, an explanation of every modification,
   affected places, risks and a grammar check of the result, (4) apply only after confirmation.
8. **Changes** lists changed files (compare side by side, *Back to original*), the history (undo/redo), restore
   points, and lets you download the changed files or the whole workspace as a ZIP, or save to the opened folder.
9. **Dictionary**: all 129 ideas of the built-in knowledge base, each at five levels.
10. **Settings**: language, dark/light colours, text size 12–24, roomy line spacing, hints on/off, keyboard
    shortcuts (arrow keys move from word to word in the code).

## Supported languages and what the app really understands

| Depth | Languages | What works |
| --- | --- | --- |
| **Full structure** (Tree-sitter syntax tree) | Python, JavaScript, TypeScript, TSX/JSX, HTML, CSS, C, C++, C#, Java, Rust, Go, PHP, Ruby, Kotlin, JSON, Bash, TOML | Exact element under the cursor; functions/classes/variables with scopes; parameters, return values, calls; definitions and references (scope-aware inside a file); bracket pairs and what they enclose; operators with their two sides; step-by-step flowcharts; imports; real grammar errors |
| **Word level** (hand-written lexers) | Swift, Lua, YAML, SQL, XML, PowerShell, INI/.env, Dockerfile, Makefile, Markdown, Batch, SCSS, .gitignore | Colours, keywords, strings, numbers, comments; bracket pairs and unbalanced brackets; functions/tables/settings/targets found by patterns (marked *Likely*); same-name uses in the file; imports for some (Lua `require`, SCSS `@import`, PowerShell `Import-Module`) |
| **Plain text** | Any other text file | Words, numbers and brackets can be clicked; the app says clearly that it does not know the language |

Language detection uses the file name, the extension, the first line (`#!…`) and the content (for example
`<?xml`, `<?php`, JSON, Dockerfile instructions, C vs C++ headers). The detection method is shown in the panel.

Imports between files are resolved for JavaScript/TypeScript (relative paths, index files), Python (packages and
relative imports), C/C++ (`#include "…"`), Go, Rust (`mod`), Java/Kotlin (package paths), PHP, Ruby, Lua, HTML
(`<script src>`, `<link href>`) and CSS/SCSS (`@import`). Anything that cannot be resolved inside the project is
reported as an outside library or as "not found among the opened files".

## Limitations (what it cannot do)

* **Opened projects are never run**, so the explainer cannot know values at run time, user input, data from files, networks or
  databases, or which branch an `if` will take. These are always marked *Unknown*.
* **Cross-file links are by name** (marked *Likely*). Code that loads things by a computed name (reflection,
  `getattr`, dependency injection, templates, routes in configuration) is invisible to it.
* **No type checking or compiler.** The grammar check finds syntax errors only; it cannot tell whether a program
  still works correctly after a change.
* **Renames** are scope-aware within one file for full-structure languages; across files they only touch files of
  the same language family that are connected to this file by an import, and they list (but do not rename)
  same-name occurrences elsewhere. Names built from text at run time are not found.
* **Swift is word-level only.** The Tree-sitter Swift grammar makes Chromium's WebAssembly compiler run out of
  memory a few seconds after it is used ("V8 process OOM (Zone)", reproduced in the test container), so it was
  replaced by a lexer. Lua and YAML also use lexers (their published grammar builds are incompatible with the
  Tree-sitter runtime used here); SQL, XML and PowerShell have no bundled grammar.
* **Very large files**: above 3,000,000 characters a file is shown as plain text (still clickable, but without
  structure). Up to 4,000 files and 5 MB per file are opened from a folder.
* **Explanations come from a fixed, built-in knowledge base** (129 ideas × 5 levels plus language keyword
  meanings) combined with facts from the analysis. It does not write free-form prose about what your specific
  program is *for* beyond what names, comments, the README and manifests reveal.
* **The Windows launcher** (`Start-Windows.bat` → PowerShell) could not be executed in the Linux test container;
  the macOS/Linux launcher (`serve.py`) and the Node launcher were tested. If PowerShell is blocked by company
  policy, run `portable/serve.mjs` with Node.js or `portable/serve.py` with Python instead.
* **The first 8 lessons** follow prepared, verified scripts (their C# versions are now also run by the C#
  interpreter in the tests). Your own code runs in the Workshop, the courses and Mini-Unity.
* **The C# interpreter** covers what beginners write (variables, conditions, loops, arrays, List, Dictionary,
  classes, properties, inheritance, enums, LINQ basics, exceptions, vectors, local functions) but not all of C#
  (no `ref`/`out`, async, generics you define yourself, reflection…); unsupported parts are reported plainly.
  **Mini-Unity** is a small 2D world with a part of the Unity API, not a game engine.
* **C and C++ are not run** (no compiler in the app). JavaScript runs without a step-by-step replay.
* **"What comes next"** is rule-based (the usual order of scripts), not an understanding of your intentions;
  local-AI guesses can be wrong.
* **Saving back to a folder** needs a browser with the File System Access API (Chrome, Edge). Elsewhere, use the
  ZIP download. Folders opened through the classic file picker or drag-and-drop are read-only.
* Explanations come from the deterministic analysis and the knowledge base. A local AI model is optional and its
  answers are always labelled as guesses.

## Architecture (for developers)

```
src/code/
  languages/   registry.ts (languages, detection), lexer.ts (word-level lexers), treesitter.ts (grammar loading)
  analysis/    engine.ts (open/element/flow/check), syntax.ts (Tree-sitter analysis), tokens.ts (lexer analysis),
               project.ts (imports, dependency graph, project overview), lines.ts, types.ts
  knowledge/   concepts.ts (+ concepts.ru*.ts, concepts.extra.ts: 129 ideas × 5 levels in two languages),
               keywords.ts (+ keywords.ru.ts), library.ts (well-known library and engine functions)
  learn/       lessons.ts (8 lessons × 5 languages), courses.ts (C# for Unity, Unreal C++), progress.ts (XP, stars),
               Learn.tsx (animation, games), CourseView.tsx
  run/         csharp.ts (step-by-step C# interpreter), runner.ts (grammar problems, input, limits), unity.ts
               (Mini-Unity world + Unity API), levels.ts, errors.ts (error translator rules), sandbox.ts (one door
               for C#/Python/JS runs), python.worker.ts + pyRunner.ts (Pyodide), js.worker.ts
  workshop/    editor.ts (CodeMirror setup, ghost text, live checks), api.ts (Unity/C# members with explanations),
               predict.ts ("what comes next"), lint.ts (beginner/Unity checks), recipes.ts ("I want…"),
               Workshop.tsx, TraceView.tsx, MiniUnity.tsx, ErrorTranslator.tsx, store.ts
  memory/      review.ts (spaced repetition), notebook.ts, resume.ts, speech.ts, MemoryViews.tsx
  ai/          localAi.ts (optional local model bridge, localhost only)
  i18n.ts      tr(en, ru), plural forms, interface language (also used inside the workers)
  explain/     explain.ts (builds the explanation for a level, with confidence)
  workspace/   workspace.ts (protected copy, change sets, restore points, undo/redo, persistence),
               proposals.ts ("what if" edits, explanations, risks), diff.ts, idb.ts
  worker/      code.worker.ts, client.ts (pool of analysis workers, at most 7 grammars each)
  sample/      the bundled example project
  ui/          CodeModule.tsx and its panels (Explorer, CodeView, ExplainPanel, Diagrams, Overview, WhatIf,
               ChangesView, Glossary), store.ts, fileLoading.ts, code.css
```

The grammars (`tree-sitter-wasms`) are bundled into `dist/grammars/` by a small Vite plugin, so nothing is fetched
from the internet. The module is lazy-loaded: the Materials studio loads exactly as before until UNDERSTAND CODE is
opened. To add a language: add it to `LANGUAGES` in `registry.ts`; either give it a grammar (and add the grammar
name to `GRAMMARS` in `vite.config.ts`) or a lexer configuration in `lexer.ts`, plus optional symbol patterns in
`tokens.ts`; add a sample to `tests/codeSamples.ts` — the tests then check detection, opening, clicking and that
every concept produced exists in the knowledge base.
