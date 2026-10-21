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
PASS  High-resolution (2048) ZIP export completes  — 14.8 s
PASS  Interface keeps rendering frames during the 2048 export  — frame gaps p95 19 ms, max 150 ms over 869 frames
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

### 4096 export — `npx tsx scripts/e2e-4096.ts`

`verification/e2e-4096.json`: the Molten Lava Crust 4096 ZIP export completed in **66 s** in the browser with no
console errors; all eight PNGs decoded as 4096×4096 with valid CRCs (ZIP 48 MB). A single-threaded Node run of the
same material peaked at **1.25 GB RSS** (generation 81 s). 4096 is therefore offered, labelled as slow and
memory-heavy; 2048 is recommended for ordinary machines.

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
