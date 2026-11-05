# Verification results

Environment: Linux container, 4 CPU cores, Node 22.22.0, npm 10.9.4, headless Chromium 141 (Playwright 1.56.1)
with **software WebGL (SwiftShader)**. Timings below come from this shared, GPU-less container and are slower than
on an ordinary desktop.

## 1. Clean install and production build

```
rm -rf node_modules dist
npm ci            -> installed from package-lock.json in 4.8 s, "found 0 vulnerabilities"
npm run build     -> tsc -b (no errors) + vite build: index 887 kB (250 kB gzip), worker 76 kB, CSS 15 kB
npm audit         -> found 0 vulnerabilities
```

The built `dist/` contains no runtime references to external hosts (checked with a grep for URLs: only XML
namespace strings and a React error-doc link appear).

## 2. Unit tests — `npm test` (Vitest, 45 tests, all passing)

```
Test Files  5 passed (5)
     Tests  45 passed (45)
```

| Area | What is checked |
| --- | --- |
| Periodic noise | gradient/value noise, fBm, anisotropic fBm, ridged, billow, domain-warped noise, Voronoi (F1, exact edge, cell id) give identical values at `(u, v)`, `(u±1, v)`, `(u, v±1)`, `(u+2, v−3)` for 400 random samples; exact Voronoi edge distance on a regular grid |
| Periodic layouts & features | all brick bonds, ashlar, planks, panels, square/offset/hex/checker tiles assign the same cell and local offset at equivalent coordinates; crack and scratch fields wrap |
| **Roll test (all 42 presets)** | generating every preset with a half-tile UV offset reproduces the original fields rolled by half a tile (≥ 99.8 % of texels within 1e-3; float rounding at exact feature boundaries is the only allowed difference). This proves complete materials are periodic, not just the primitives |
| Seam statistics | wrap-around neighbour differences (last→first column/row) of height and base color are within the range of ordinary neighbour differences for every family (first/last pixels are *not* required to be equal) |
| Derived maps | normals and AO of a rolled height field equal the rolled normals/AO (toroidal derivatives and blurs) |
| Normals | flat field → (0,0,1) = (128,128,255); a known sinusoidal slope gives the predicted vector; height rising to +V gives green < 128 (OpenGL); all normals unit length (8-bit decoded within ±2 %); DirectX only inverts green |
| AO | flat → 1.0; grooves darkened, plateaus not |
| Library | ≥ 12 families, 42 presets (≥ 2 per family), presets only use known parameters, every preset has non-empty varied base color/height/normal maps and emission where applicable; every pair of families differs clearly |
| Determinism | same settings + seed → byte-identical maps for every family; different seed → different maps; parallel band generation is byte-identical to single-pass generation |
| Semantics | brushed metal metallic = 1 everywhere; stone/brick/wood/concrete/tiles/sand/rock metallic = 0; rust dielectric and rougher than exposed steel; roughness not a grayscale copy of base color; lava emission < 2 % on raised crust; carved arcane stone has no emissive map; brick mortar recessed below faces |
| PNG encoder | exact round trip for 8-bit gray/RGB/RGBA and 16-bit gray (independent decoder, CRC checked); correct color type/bit depth per map; sRGB chunk only on color maps |
| Export | 16-bit height samples equal the generated data; DirectX normal = OpenGL with inverted green; ORM = (AO, Roughness, Metallic); file names such as `stone_wall_seed_1042_normal_opengl_2048.png`; ZIP contains exactly the applicable maps + settings.json + README (no emissive/ORM when not applicable) |
| Settings JSON | export → import reproduces settings and byte-identical output; invalid JSON, foreign format, future schema version, missing material, unknown family and bad seed are rejected with specific messages; out-of-range / invalid / missing / unknown parameters are repaired with warnings; no prototype pollution |
| State | stale-version results are rejected and drafts never replace a full result; undo/redo coalescing; reset to preset; variations keep family + essential parameters and stay within bounds, reproducible and seed-lock aware; favorites/prefs persistence and recovery from corrupt storage |

## 3. Browser end-to-end — `npm run e2e` (39 checks, all passing)

Report: `verification/e2e-report.json`; screenshots: `verification/screenshots/`.

```
PASS  First run opens directly into a generated material  — 8.2 s to first full material (software WebGL, shared CPU)
PASS  Workflow introduction is shown on first run
PASS  Preset gallery shows real generated thumbnails  — 42 thumbnail canvases
PASS  Introduction can be dismissed
PASS  Preview: castle_ashlar on wall / oak_floor on block / corroded_plate on sphere /
      molten_crust on floor / weathered_brick on scene / glowing_runes on wall
PASS  Lighting preset switches; Turntable toggles
PASS  Rapid slider changes never leave a stale result displayed  — 31 rapid edits
PASS  Undo and redo restore material changes
PASS  Randomize seed / Seed lock / Reset to preset
PASS  Controls that do not apply are hidden
PASS  Switching presets and objects does not accumulate WebGL resources  — textures 11 -> 11, geometries 14 -> 14 after 18 switches
PASS  Selecting a variation applies that exact configuration
PASS  Inspector switches between all generated maps  — 8 enabled map views
PASS  Inspector zoom and texel readout work
PASS  Inspector "Export map" downloads the viewed map  — stone_wall_seed_1042_basecolor_512.png
PASS  Favorites persist across reloads; Current material persists across reloads
PASS  High-resolution (2048) ZIP export completes  — 11.0 s
PASS  Interface keeps rendering frames during the 2048 export  — frame gaps p95 18 ms, max 66 ms over 660 frames
PASS  ZIP contains the expected files (8 maps + README.txt + settings.json)
PASS  Exported PNGs are 2048x2048 with valid encoding (height 16-bit, others 8-bit)
PASS  ORM channels are R=AO, G=Roughness, B=Metallic
PASS  Long exports can be cancelled
PASS  Settings JSON downloads; Preview PNG downloads a real image (830x570); individual map download
PASS  Importing settings JSON restores the material
PASS  Invalid settings JSON shows a helpful error
PASS  Key controls are visible and unclipped at 1366x768
PASS  Without WebGL a useful 2D fallback is shown
PASS  No console errors during the whole session
39 passed, 0 failed
```

A bug found by this run and fixed: at 1366 px the Map Inspector's map selector and zoom toolbar overlapped (a
click was intercepted). They now share one wrapping toolbar.

### 4096 export (first iteration, in-memory path) — `npx tsx scripts/e2e-4096.ts`

`verification/e2e-4096.json`: the Molten Lava Crust 4096 ZIP export completed in **66 s** in the browser with no
console errors; all eight PNGs decoded as 4096×4096 with valid CRCs (ZIP 48 MB). A single-threaded Node run of the
same material peaked at **1.25 GB RSS** (generation 81 s). This was the first iteration; 4K and 8K now use the
streaming pipeline described in section 3b.

## 3b. 8K textures and GLB models (second iteration)

### Unit tests — now 54, all passing (`npm test`, 7 files)

New tests in `tests/stream.test.ts` and `tests/glb.test.ts`:

* the strip-based 4K/8K pipeline produces **byte-identical** base color, normal (8- and 16-bit, OpenGL and DirectX),
  roughness, metallic, height (8- and 16-bit) and emissive PNGs compared with whole-image generation; AO/ORM differ
  by at most 1 level; ZIP CRCs reported by the stream are correct; out-of-order strips are rejected;
* 16-bit normals are unit length and agree with the 8-bit normals;
* the streaming PNG encoder round-trips sparse data that **broke fflate's streaming deflate** (bug found during this
  work: fflate's `Zlib` stream produced corrupt output for some sparse inputs pushed in pieces; the one-shot
  `zlibSync` used for ≤2K exports was re-checked and is correct, so earlier exports were valid). 4K/8K streams now
  use the platform's native `CompressionStream`;
* the stored-ZIP writer produces archives read correctly by an independent unzipper;
* GLB files for all five preview objects are structurally valid (aligned buffer views, index ranges, accessors),
  embed the exported PNGs byte for byte, add `KHR_materials_emissive_strength` when needed, convert UVs to glTF
  orientation with the preview's metre scale, and baking displacement yields a >100 000-triangle mesh with relief
  bounded by the displacement depth.

### 8K ZIP in the browser — `npx tsx scripts/e2e-4096.ts 8192`

`verification/e2e-8192.json`: Molten Lava Crust at 8192×8192 exported through the real UI in **79 s**; ZIP 277 MB;
all eight PNGs decode as 8192×8192 with valid CRCs; no console errors; the page's JS heap stayed at ~100 MB during the
export. Python `zipfile.testzip()` reports no CRC errors; Pillow reads the height map as 16-bit (`I;16`, 55 160
distinct levels) and decoded normals have length 0.994–1.007. The 4K ZIP took 20 s (previously 66 s with the
in-memory path, whose main-thread heap reached ~930 MB).

Bug found by inspecting 8K crops at 1:1 and fixed: scattered round features (rust pits, concrete pores and aggregate,
granite specks, brick pits, pebbles) were clipped by Voronoi cell borders — a straight cut visible only at high
resolution. They now test all nine neighbouring cells.

### GLB models — `npm run e2e:glb`

`verification/e2e-glb.json`; each model is exported from the export dialog, validated with the **Khronos
glTF-Validator** (`gltf-validator` 2.0.0-dev.3.10), then loaded with three.js' `GLTFLoader` in a separate page and
rendered (`verification/screenshots/20-glb-*.png`):

| Model | Textures | Export | Size | Validator | Triangles |
| --- | --- | --- | --- | --- | --- |
| Corroded Steel Plate, block | 1K | 4.0 s | 3.1 MB | 0 errors | 2 028 |
| Castle Ashlar, wall, **baked displacement** | 2K | 15.3 s | 16.2 MB | 0 errors | 240 000 |
| Molten Lava Crust, sphere (emissive) | 4K | 20.0 s | 46.5 MB | 0 errors | 16 128 |
| Weathered Old Brick, scene (6 meshes) | 1K | 3.1 s | 2.3 MB | 0 errors | 4 190 |
| Glowing Rune Slabs, block (emissive) | **8K** | 69.4 s | 120.3 MB | 0 errors | 2 028 |

The only validator warning is `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` (no tangents stored; viewers generate
MikkTSpace tangents, as for Blender's default glTF export). For the 8K model, `GLTFLoader` decoded all six 8192 px
texture slots; because the test container renders with software WebGL (SwiftShader, no GPU), the viewer
downscaled the textures to 2048 px for the screenshot only.

A layout issue found in the 1366×768 screenshot and fixed: with the new 3D-model section the export dialog was taller
than the window, pushing the *Download ZIP* button partly out of view; the dialog footer is now sticky
(`verification/screenshots/19-export-dialog-8k.png`).

The main browser suite (`npm run e2e`) was re-run after these changes: **39 passed, 0 failed**, no console errors.

## 4. Independent PNG check (Python Pillow)

The example exports in `examples/` were re-read with Pillow: all maps 512×512; height PNG mode `I;16` with
25 233 (stone) and 42 224 (lava) distinct levels, confirming real 16-bit precision; decoded normal vectors have
length 0.994–1.006.

## 5. Visual review

Screenshots reviewed: default workspace, preset gallery, stone on wall, wood on block, rusted metal on sphere,
emissive lava floor, brick scene, arcane glow wall, displacement sphere, variations, 3×3 inspector (normal and base
color), favorites, export dialog and progress, 1920×1080 scene, no-WebGL fallback. Problems found and fixed during
review: over-exposed studio lighting; wood grain that looked like contour lines (rewritten with near-parallel log
axis, gentle ring wander and knots that deflect the grain); arcane borders glowing on every slab (only glyphs glow
now); polka-dot concrete pores and aggregate; uniform granite specks (now mixed dark/light grains); confetti-like
gravel (rotated, irregular pebbles); concrete presets that looked alike (stronger formwork, distinct tones);
weathered knots rendered as dark dots.

## 6. UNDERSTAND CODE (third iteration)

All commands below were run in the test container (4 cores, Chromium 141 headless shell from Playwright 1.56.1).

### Unit tests — 124 in total, all passing (`npm test`, 10 files)

70 of them are new and cover the code module:

* `tests/code-languages.test.ts` (39): detection by extension, file name, shebang and content (incl. `.h` C vs C++,
  unknown → plain text, binary detection); every language opens with the expected analysis depth, valid samples
  report no syntax problems and a word can be explained (28 sample files, one per language/format); functions are
  found in every full-structure language; Swift/Lua word-level symbols; invalid Python/JS/Lua report problems
  without crashing; empty and Unicode files; a 24,000-line file opens in a few seconds, and a file above
  3,000,000 characters falls back to plain text.
* `tests/code-explain.test.ts` (14): scope-aware definitions/references (a variable with the same name in another
  function is not linked), functions (parameters, defaults, return values, docstring, flow), brackets with partners,
  operators with both sides, keywords; five different explanation levels for six element types; "I don't
  understand" gives a different wording each time; name-based links are never marked *Verified*; go-to-definition
  data; the example project's dependency graph, entry point and overview; import resolution for TS/Python/C/HTML;
  knowledge base integrity (103 ideas × 5 levels) and that **every concept produced by clicking every character of
  all 28 samples** exists; a static scan that `src/code` contains no network calls; opening a file with side
  effects does not execute it.
* `tests/code-workspace.test.ts` (17): diff (minimal changes, side by side, 60,000-line worst case under 5 s);
  proposals (value change, invalid input refused, cross-file rename only across imports with warnings for
  unrelated same-name code, keywords/invalid names refused, local rename stays in its function, switching a Python
  line off adds `pass` and still parses, a breaking edit is detected by the syntax check, stale selections refused);
  workspace (restore point before every change, originals untouched, undo/redo, restore and revert are undoable,
  save keeps the old original, session persistence and corrupt storage ignored).

### Browser end-to-end — `npm run e2e:code` (55 checks, all passing)

Every request that does not go to the local preview server is aborted for the whole session; the report confirms
no request was attempted. Report: `verification/e2e-code-report.json`; screenshots: `verification/code/`.

Covered: opening the module from the top bar and returning to Materials; the example project's explanation and
starting point; clicking a variable, function, operator, keyword and bracket; the five levels (all different,
remembered after a reload together with the workspace); level-5 exercise; flowchart and function diagrams;
"I don't understand" and "Show me with an example"; show every use; go to definition within a file and across
files; keyboard navigation and level keys; the what-if flow (preview diff, risks, nothing changed before
confirming, apply disabled until the acknowledgement, restore point created, original kept, changed lines marked),
detection of a breaking edit, a cross-file rename; undo/redo (buttons and Ctrl+Z), going back to a restore point,
ZIP download; project map; glossary; light theme and text size; opening 30 files at once (28 languages and formats
detected correctly, a PNG listed but not opened, a script containing `alert()` opened without running it); search
inside the code; a 24,000-line file (about 5 s to open, only ~54 line elements in the page) and clicking deep
inside it; working with the network switched off; no page or console errors.

**Problem found and fixed during this run:** after all grammars had been used, the tab crashed a few seconds later
with `V8 process OOM (Zone)` in Chromium's log. Testing every grammar alone (15 s wait each) showed that only the
Tree-sitter **Swift** grammar triggers it; the other 18 grammars passed individually. Swift now uses the word-level
analyser, and grammars are additionally spread over a pool of analysis workers (at most 7 per worker; 3 workers
for all 18). The e2e checks that the page stays alive 15 s after loading every grammar.

The material studio suite (`npm run e2e`) was re-run on the same build: **39 passed, 0 failed**.

## 7. Learning, Russian interface, C/C++/C#, portable package (fourth iteration)

* **Unit tests: 170, all passing** (`npm test`, 12 files). New:
  * `tests/learn.test.ts` (39): every lesson in every language — animation markers point at real lines, games
    are consistent (the "find the mistake" edit applies, "put in order" lines exist, output questions match),
    no marker leaks into the visible code, and **the C, C++, Python and JavaScript programs are compiled
    (`gcc -std=c11 -Wall -Werror`, `g++ -std=c++17 -Wall -Werror`) or run (python3, node) and print exactly what
    the animation shows**. C# versions are checked structurally only (no C# compiler available).
  * `tests/code-i18n.test.ts` (7): all 129 ideas, every keyword (general and per-language) and every operator
    have Russian text; explanations at all five levels for every character of the 28 language samples contain
    no left-over English sentence; what-if proposals and the project overview are Russian; recognition of C/C++
    pointers, addresses, `->`, `::`, preprocessor, memory, destructors, references, `virtual`; C# properties,
    events, nullable types, LINQ; Unity callbacks and library calls; Unity and Unreal projects.
  * This test found a real crash (explaining a bracket from the word-level analyser without bracket details);
    fixed.
* **Browser e2e `npm run e2e:code`: 68/68** (adds the guide's next-step button, the step-by-step player for real
  code, a complete C# lesson with animation, all four game types, XP/stars saved, next lesson, and switching the
  whole interface to Russian). Screenshots `verification/code/12-…15-…`. No request left the computer.
* **Materials e2e `npm run e2e`: 39/39** on the same build.
* **Portable package** `release/MaterialFoundry-portable.zip`: unpacked and started with `Start-Linux.sh`
  (`serve.py`): `index.html` served as `text/html`, grammars as `application/wasm`, files outside the app folder
  are refused, the server listens on 127.0.0.1 only. The Windows launcher (PowerShell `TcpListener` server) could
  not be executed here — downloading PowerShell into the container was not permitted — so it is untested.

## 8. Workshop, Mini-Unity, courses, memory, local AI, desktop installer (fifth iteration)

* **Unit tests: 247, all passing** (`npm test`, 15 files). New:
  * `tests/csharp-run.test.ts` (14): every C# lesson program runs in the step-by-step interpreter and prints exactly
    what its animation shows; everyday beginner C# (lists, dictionaries with `["k"] = v`, floats, LINQ, local
    functions, classes with properties and `ToString`, `switch`, `ReadLine`, `try/catch`); call-stack trace frames;
    plain-language errors (missing `;`, unknown name, endless loop, NullReference, IndexOutOfRange, DivideByZero,
    stack overflow); **every Mini-Unity level is won by its reference solution and not by its starter**, played
    automatically with simulated key presses; Unity mistakes (CS1612, endless loop in `Update`, no MonoBehaviour).
  * `tests/workshop.test.ts` (15): "what comes next" walks through the usual shape of a Unity script (using → class →
    fields → Update → GetAxis → Translate with deltaTime → jump with AddForce → triggers with CompareTag → score),
    console C#, Python and JavaScript; member suggestions by declared type; all beginner/Unity checks fire on wrong
    code and stay quiet on correct code (including the learner's own variable names); recipes are found from Russian
    wishes in any word form; every recipe's notes match its code; **every C# recipe parses without grammar problems
    and every Unity recipe has no error-level finding; console recipes really run** (the guessing game is played to
    the end); the error translator explains pasted Unity console output with file and line.
  * `tests/courses.test.ts` (48): **every C# course example runs for real with a step-by-step trace; every task's
    reference solution prints exactly the expected lines and the starter does not**; quiz answers and notes are
    consistent; `Console.Write` + `WriteLine` stay on one line and input starts a new one.
  * `tests/code-explain.test.ts`: the "never contacts the network" guard now also checks that the sandbox workers
    name network functions only in order to remove them.
* **Python runner checked in Node with the bundled Pyodide**: output, `input()` answers and the "needs input" signal,
  the 200 000-line endless-loop stop, IndexError and SyntaxError with the right line.
* **Browser e2e `npm run e2e:workshop`: 49/49**, offline (every non-local request is blocked), Russian interface:
  ghost text inside `Update` and the next guess after Tab; Unity member suggestions with Russian explanations; live
  checks for lowercase `update` and CS1612 and the one-click fix; "Хочу…" recipe → new file; C# run with
  `ReadLine` answer, step-by-step replay with the call `Twice(n = 21)`; runtime error explained; **real Python with
  `input()`** and its replay; endless Python and JavaScript loops stopped; JavaScript error on the right line and
  no `fetch` in the worker; C++ honestly not run; **Mini-Unity: a level won, Inspector values, an endless loop caught,
  real key presses → `Debug.Log`, a Workshop script in the sandbox**; error translator; notebook → review cards;
  "continue where you stopped"; a review session; focus timer; **local AI with a fake local Ollama** (model list,
  non-local address refused, AI guess shown as marked ghost text, only `/api/…` on localhost contacted);
  **C# for Unity course lesson** (real replay, quiz, wrong task output shown next to the expected one, right answer
  accepted); Unreal lesson walk; compare languages; no horizontal scroll at tablet width. The run found two real
  bugs that were fixed: the step replay stole the editor cursor on every re-render, and checks of a closed editor
  could overwrite the problem list of the next file.
* **Browser e2e `npm run e2e:code`: 68/68**, **materials `npm run e2e`: 39/39** on the same build.
* **Desktop app (Electron 44.9.0)** — `xvfb-run -a npm run e2e:desktop`: **13/13** on the Linux build of the same
  app: materials studio renders, the page loads from `app://` with a strict CSP and no Node.js access (only the
  `aiRequest` bridge), files outside the app folder are refused, C# and **Python from the packaged Pyodide** run,
  a Mini-Unity level is won, the **local AI is reached through the main process** (a fake local server without CORS
  headers), non-local addresses are refused by the bridge, and navigation to a website is blocked.
  `--smoke-test` mode passes.
* **Windows installer** `MaterialFoundry-Setup-1.0.0.exe` (NSIS, 128 MB, sha256 `61d0b7055f61…0533acf6b` for this
  build) was built in the Linux container with Wine and checked **under Wine**: license page (RU/EN text), "only for
  me / all users", **the folder choice page**; a silent install into `C:\Games\Material Foundry` produced the program,
  `resources/app.asar` (containing `main.cjs`, `preload.cjs`, `server.cjs`, `app/index.html`, Pyodide and the C#
  grammar), the uninstaller and the desktop and Start-menu shortcuts; the silent uninstall removed the folder and the
  shortcut. Under Wine the installer falsely reports "Material Foundry is running" (Wine's process list), so that
  check was disabled **only in a verification copy**; the shipped installer keeps it. The installed Windows Electron
  program does not open a window under Wine, so it was **not run on Windows here**; the workflow
  `.github/workflows/desktop-installer.yml` builds the installer on `windows-latest`, installs it into a custom
  folder, starts the installed program with `--smoke-test`, uninstalls it and uploads the installer as an artifact.
* **Portable package** rebuilt (9.8 MB, now with Pyodide): unpacked and started with `serve.py`; Python ran in the
  Workshop from the served files. The servers now also send `.zip` and `.woff` with the right types.

## 9. Mini-Unity runs every Unity recipe (sixth iteration)

* **Unit tests: 262, all passing** (16 files). New `tests/unity-recipes.test.ts` (15): every MonoBehaviour recipe
  from "I want…" starts in the sandbox without errors, and **each one is checked by what it does**: the 2D walk
  moves the hero; the platformer's ground check and layer are filled in automatically and the hero jumps only from
  the ground; the CharacterController walk stays grounded; rotation is 90°/s; look-at-mouse turns to 90° when the
  mouse is above; the camera follow moves the camera; the moving platform goes back and forth; a coin adds exactly
  one point (OnTriggerEnter2D once); Space fires a bullet flying right that is removed after 3 s; the enemy chase
  gets closer and the patrol walks and mirrors; the spawner creates one object every 2 s; the countdown counts,
  Escape sets `Time.timeScale = 0`; the coroutine blinks with `WaitForSeconds` and ends; Animator parameters are
  set; the raycast sees a coin and draws its ray; `Destroy(gameObject, 2)` waits two seconds. All earlier tests
  (lessons, 9 Mini-Unity levels, courses) still pass.
* **Browser e2e `npm run e2e:workshop`: 51/51**: the "shoot" recipe from "I want…" opens in the sandbox, the empty
  Inspector fields are filled and written to the Console, and a real mouse click on the game fires a bullet.
  `e2e:code` 68/68, materials 39/39, `e2e:desktop` 13/13 on the same build.

## 10. Unity fun pack: more recipes, levels and trainers (seventh iteration)

* **Unit tests: 310, all passing** (17 files). New and extended:
  * `tests/unity-recipes.test.ts` (27): 12 new Unity recipes are checked by behaviour in Mini-Unity — double jump
    (a second jump in the air, then no third), dash (Shift moves far, then cools down), respawn after falling,
    enemy shooter (a bullet flies towards the hero after 1 s and hits him), homing enemy (turns and comes closer),
    waypoints (`Transform[]` filled in the Inspector, the loop visits both ends), typewriter dialogue (letter by
    letter), regeneration (+1/s up to the maximum), coin magnet, combo (raises and resets), collect-all (Victory
    once), enemy turn-around by raycast.
  * `tests/csharp-run.test.ts` (19): 14 Mini-Unity levels; the 5 new ones (coroutine, InvokeRepeating, ground
    raycast, FindWithTag, arrays/foreach) are won by their solutions and not by their starters (in the ground-raycast
    level the starter's air jumps fly into the spikes).
  * `tests/trainers.test.ts` (31): every one of the 26 "find the bug" cases has exactly one marked line, its fix
    has valid grammar, and the 11 cases the live checks know are flagged on that line before the fix and not after;
    every "predict the output" template produces valid questions for 25 random seeds each (≥ 4 unique options,
    exactly one right answer equal to the interpreter's output, every wrong option explained); event order, quiz
    answers, cheat sheet and achievements are consistent.
* **Browser e2e `npm run e2e:workshop`: 57/57** (adds: trainers with the daily goal, finding a bug by tapping lines,
  predicting an output with a step-by-step replay, the perfect Unity event order, downloading the cheat sheet,
  achievements unlocking). It found that Chromium drops Cyrillic download file names, so downloads now use Latin
  names. `e2e:code` 68/68, materials 39/39, `e2e:desktop` 13/13.
