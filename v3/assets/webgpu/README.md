# Isolated v3 WebGPU aircraft experiment

This directory is an experiment layered over the fresh v2 copy. Root `assets/` and `v2/` are read-only inputs. It is not a claim of a visual or performance improvement on every device.

## Renderer selection and evidence

- Normal v3 visits progressively try WebGPU near the aircraft (720px proximity), or immediately for a direct aircraft/telemetry fragment. The modern JS is not imported until an adapter exists.
- `?renderer=webgpu` explicitly exercises this same real WebGPU path.
- `?renderer=webgl` loads `legacy-aircraft-hero.js` without importing modern Three.
- Unsupported APIs/adapters, import/device/scene/shader failures and device loss restore a clean canvas and the isolated legacy WebGL controller. The photographs remain the final fallback.
- Reduced motion, data-saving and short viewports keep the accessible static presentation.
- A successful `WebGPURenderer.init()` alone is never “ready”. Every published live frame has submitted actual scene draws, drained that exact device's `GPUQueue.onSubmittedWorkDone()`, and checked GPU validation scopes. Superseded poses remain masked as in the original controller.

Inspect `window.V3WebGPU.snapshot()` and the aircraft root's `data-webgpu-*` attributes. `adapterClass` is `software` for reported SwiftShader/llvmpipe/fallback adapters, `hardware-reported` only for non-software adapter information, otherwise `unknown`. Adapter information is a report, not a benchmark. The captured source geometry has 63 animated parts, 117 source occurrences and 790,176 aircraft triangles; the telemetry pack contributes 153 source components.

`?capture` retains `window.__v3Aircraft.seekLanding(value)`, `.seekProgress(value)`, `.resume()`, and renderer/scene/camera/flight references, alongside the original aircraft completion/pose datasets. The page's other product renderers remain on their own legacy `window.THREE`; this experiment never assigns or mutates that global.

## Migration

- `scene.js`: the source trainer GLB through pinned modern GLTFLoader + MeshoptDecoder; original covering deformation, separation, electronics placement, landing, camera fit and telemetry handoff preserved. Modern dependencies are explicit modules.
- `electronics.js`: original illustrative power/control geometry, isolated as an ESM factory. Its source provenance remains in the model.
- `board-assets.js`: same lossless packed telemetry geometry reconstructed into a separate modern scene graph; old texture encodings explicitly translated to modern color spaces.
- `studio.js`: same softbox design, rebuilt with the modern renderer's PMREM. The r128 precomputed CubeUV/RGBE blob is never fed into r186. Legacy light intensities are translated for modern physically based units. Explicit per-object TSL ACES output keeps the sky and floor CSS-matched; the modern board coating is calibrated to preserve its original blue pigment instead of washing it out with specular highlights.
- `atmosphere.js`: accepted finite airfield shader ported to WGSL through TSL, with output-managed sRGB colors; ground opacity and restrained world-space wear use node materials. No ignored ShaderMaterial or onBeforeCompile compatibility shortcuts.
- `aircraft-controller.js`: isolated derivative of the accepted controller retaining scroll smoothing, direct input, narration, accessibility, tab/visibility pacing, finite warmup and capture controls. All live modern draws use real queue completion. Device failure detaches handlers and observers before fallback.

The modern floor detail differs from the legacy detailed floor shader. The r186 lighting/tone response may differ from r128 and needs visual review. No pixel parity or speedup is asserted.

## Vendor and verification

`vendor/three-0.186.1/` comes from the official npm `three@0.186.1` tarball, with MIT license preserved, local ESM imports and esbuild 0.25.11 minification. `PROVENANCE.json` records source tarball and served-file hashes. Total JS is approximately 1.23MB uncompressed / 339KB gzip before HTTP overhead, lazily requested near the section.

Development validation completed before browser CI: module syntax/import closure, Naga WGSL parse/validation, and actual r186 renderer API/shader validation using official `webgpu@0.6.2` Dawn's **null backend**. The latter used full source aircraft/telemetry geometry and surrogate 1px silk textures across six forward/reverse poses, producing 3,082 draw calls / 6,107,348 submitted triangles with queue completion and zero validation errors. It is not evidence of rendered pixels or hardware performance. Browser screenshots, real image textures, DOM/lifecycle behavior and performance require the separate Chromium/WebKit QA harness.

Supplemental visual validation: official Dawn Vulkan successfully rendered and read back landing, assembled, peel and telemetry poses through the installed Chromium SwiftShader ICD (`google / swiftshader / SwiftShader driver 5.0.0`, fallback adapter). The full geometry and original SVG silk artwork were used, with SVGs rasterized to RGBA textures for the native test. All four captures drained the device queue with clean validation. This establishes visible software-rendered output, not browser lifecycle behavior or hardware performance; browser DOM, actual HTMLImageElement uploads and accessibility checks still belong to browser CI.
