# V2 CAD studio and posters

The homepage studio and its posters use the same renderer in `assets/v2-cad.js`. The two 1600 × 1200 WebP posters have transparent backgrounds. They are rendered CAD illustrations, not photographs.

## Provenance

| Render | Geometry | Silkscreen |
| --- | --- | --- |
| Framework ESP32 | `assets/models/framework-esp32/framework-board.glb`; the original `P1` subtree from `framework-usbc.glb` supplies the Molex connector | `assets/models/framework-esp32/framework-markings-silk.svg` |
| TramTrace | `assets/models/tramtrace/tramtrace-kicad-source.glb` | `assets/images/interactive/tramtrace/tramtrace-front-silk.svg`, cropped and recolored into `assets/images/v2/tramtrace-silk.svg` |

The renderer preserves the source meshes, component placements and handedness. It scales the KiCad metre coordinates uniformly into millimetres and centers each assembly for framing. The separate Framework connector receives its assembly transform; no procedural replacement connector is used. Studio materials, lighting and camera angle are presentation choices. The PCB mask is rendered black. Source files are never overwritten.

The GLB silk mesh is hidden in favor of the higher resolution source SVG. Framework's overlay retains the two M2 mounting holes. TramTrace's SVG uses the existing board crop `5.6897 1.11 207.81 94.55`; its path artwork is unchanged, and black plot ink becomes pale white. The unpopulated TramTrace C83 package is hidden, consistent with the existing production-board turntable pipeline in `scripts/build-tramtrace-turntable.py`.

## Regenerate

Requirements: Node.js with the `playwright` package, a Chromium installation for Playwright, and Python with Pillow. For an environment without those dependencies:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python -m pip install Pillow
```

Serve the repository root in one terminal:

```sh
python -m http.server 8080 --bind 127.0.0.1
```

In another terminal, from the repository root:

```sh
node scripts/render-v2-cad.cjs
python scripts/finish-v2-cad.py
```

`V2_BASE_URL` optionally selects a different server origin. `CHROMIUM_EXECUTABLE` optionally selects an existing compatible Chromium executable. The scripts contain no machine-specific runtime paths.

The capture script regenerates the derived TramTrace silk, loads `/v2/render/?model=framework` and `/v2/render/?model=tramtrace`, verifies source-model readiness, then saves PNG captures under `assets/images/v2`. It compares SHA-256 hashes of all five source files before and after capture. The conversion script verifies image dimensions and alpha, encodes quality-88 WebP, verifies the result, replaces the corresponding poster, and removes only its generated PNG. Pass `--keep-png` to retain captures for inspection. Failed rendering does not replace the existing WebP.

Inspect the finished posters visually after changes to model transforms, silk registration, materials, or lighting. Camera framing depends on model geometry; a successful capture alone does not prove correct placement.

## Runtime contract

The poster remains visible until the visitor chooses **Explore in 3D**. Three.js, the GLTF loader and geometry load only after that action. The initial camera matches the still for a seamless handoff. Preset changes use a 720 ms orbit with smooth acceleration, the shortest yaw path and a small framing pullback. Direct pointer or keyboard input immediately takes control. Reduced motion gives instant presets, including when the preference changes during a move. Capture mode also uses instant presets so poster generation stays deterministic.

Rendering occurs only during the finite camera move or in response to input, resize and visibility changes; there is no idle animation. An offscreen or hidden tab pauses the camera clock and resumes from the same pose. Static light shadow maps are reused during camera movement. Touch retains vertical page scrolling and browser pinch zoom. Preset buttons and keyboard controls provide alternatives to pointer rotation. A model or WebGL failure restores the still.

The studio root reports `data-cad-state="poster|loading|ready|unavailable"`, `data-cad-source="kicad-glb"` after loading, `data-cad-angle` for the synchronously selected view, and `data-cad-frames` for render-count diagnostics. `data-cad-motion="idle|transition|paused|dragging"` reports camera activity; `data-cad-orbit` records the last rendered yaw, pitch and zoom. `data-cad-view` belongs only to the preset buttons. Context loss disposes WebGL resources, disconnects observers, cancels the current transition and removes interaction listeners.

Run the camera acceptance checks against a running server with `node scripts/verify-v2-cad-motion.cjs`. They cover intermediate poses, final framing, shortest orbit, input interruption, no idle rendering, offscreen pause/resume, reduced motion and context loss during animation. The same optional runtime environment variables used by the capture script apply.
