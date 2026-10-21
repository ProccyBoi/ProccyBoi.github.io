# V3: Orbital Workshop

The authored `/v3/` homepage is a new, independent portfolio direction. It does not load the previous v2 assembly/aircraft homepage controllers. Root, v2, shared assets, source models, and public project facts remain unchanged.

## Visual language

Cobalt, graphite and paper; oversized self-hosted Archivo; quiet Plex Mono field labels; an enormous procedural orbital instrument. The scene is explicitly an abstract form study, not an aircraft simulation or live flight telemetry. Four destinations change its geometry: gimbal, network trajectories, stacked electronics, and an audio resonator. Real source-derived board images and existing case studies carry the project evidence below it.

Recovered references were reviewed for composition and interaction rather than copied wholesale: Taste's subject-specific art direction and screenshot iteration, SpaceX's scale and spare foreground hierarchy, Motion's scene/DOM continuity, and the repository's prior reference-capability ledger. These references are not endorsements. No new third-party design/runtime library is shipped.

## Rendering

- `v3/assets/orbital-engine.js` contains four procedural triangle assemblies, a native WGSL vertex/fragment pipeline, depth, four-sample antialiasing, camera math and an interruptible 620ms fixture transition.
- WebGPU is the normal first choice on available hardware adapters, without an opt-in gate.
- Software adapters and Save Data choose a static Canvas2D view of the same geometry. Missing WebGPU, initialization/validation errors, and device loss fall back without a retry storm. The UI identifies the actual renderer rather than inferring success from API presence.
- `?gpu=force` is a diagnostic-only override allowing CI's known software adapter to exercise native WebGPU. It does not imply hardware speed.
- The engine reports WebGPU only after a real queue completion. Submitted/completed counters are distinct and `getState()` is read-only.
- One render loop runs only while visible and moving. Pause, hidden tabs, offscreen scenes and reduced motion stop continuous submission. Pointer input never animates the static fallback.
- Reduced motion retains a still GPU view where supported and instantly changes scenes. The motion toggle is hidden while that preference is active. Save Data avoids requesting an adapter.
- Device-pixel ratio and total pixel area are capped. Text, links and project evidence remain ordinary accessible HTML, independent of graphics readiness.
- A CSS schematic is present before JavaScript and remains when scripting is disabled. Scene buttons begin disabled and are only enabled by their working controller.

## Files and maintenance

- `v3/index.html`: authored homepage, factual project summaries and native routes.
- `v3/assets/orbital.css`: homepage composition and responsive states.
- `v3/assets/orbital.js`: progressive enhancement and scene/content selection.
- `v3/assets/orbital-engine.js`: native WebGPU and Canvas2D fallback.
- `v3/assets/orbital-interiors.css`: restrained v3-only reading-room styling.
- `scripts/build-v3-pages.py`: maintains copied factual interiors and adds their v3 stylesheet; explicitly preserves the authored homepage.

Earlier WebGPU aircraft/Kiku modules remain available for existing project explorers and historical diagnostic tooling. They are not the new homepage renderer.

## Verification

Run:

- `python3 scripts/build-v3-pages.py --check`
- `python3 scripts/v3-webgpu/verify-isolation.py --base e21ffc8a18c27b84abcc40fb6a3efe9132ba8391`
- `python3 scripts/audit-v2.py`
- `node scripts/kiku-simulator/verify.cjs`
- `node scripts/verify-v3-aircraft-transport.cjs`
- `node scripts/verify-flight-review-runtime.cjs`

`.github/workflows/verify-v3-orbital.yml` runs source tests plus pinned Chromium and WebKit checks. Its native renderer check uses the proven headed Vulkan/SwiftShader configuration, independently observes native device/configure/draw/submit/completion calls, and checks screenshot pixels for actual cobalt geometry and dark structure. It covers responsive layouts, all four project destinations, keyboard activation, no-JavaScript content, reduced motion, Save Data, device loss, offscreen suspension and viewport changes. Artifacts contain screenshots and explicit test results.

Browser correctness on software rendering is not a hardware performance benchmark. Native browser evidence and screenshot review are separate requirements from structural checks. No timing/speed claim should be made from instrumented CI.
