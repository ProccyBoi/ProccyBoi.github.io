# Full Dash device in the v2 hero

The second homepage chapter uses the complete device from `V2HardwareModels` and `DashAssembly`, with the original PCB and supplied base/lid meshes, OLED module, speaker, battery, magnets, touch surfaces and wiring. Its 86 movable parts retain the standalone assembly's authored paths and exact reassembly poses. The existing geometry provenance and representation limits remain in `assets/models/hardware/dash/README.md` and `device-sources.json`.

The hero does not run a second character simulation. `scripts/build-v2-hero-assets.cjs` renders a static 128 × 64 idle frame with the existing `assets/dash-display.js` renderer. The 656-byte PNG is applied to the existing OLED surface. It is derived from the source-informed browser display adaptation, with the AGPL-3.0-or-later attribution and source references retained in `assets/dash-display.js`.

## Pack and framing

- `/assets/models/hero/dash.idx.bin.gz`: 912,155 bytes at the initial 28 October build, compared with the retained telemetry pack's 1,339,424 bytes.
- The plain compatibility pack is 4,814,568 bytes. Gzip byte-lane transport restores the exact plain bytes.
- The complete device has 86 movable parts, 248 meshes, three line groups and 126,872 triangles. The line groups include the original housing outlines; they are preserved by the pack serializer.
- Forty-one bounds samples follow the original explosion. The hero interpolates those precomputed framing values so the full assembled or exploded device stays readable without recomputing its bounds on every frame.
- Source part geometry, materials, component identity and transforms remain intact. The hero uses the existing assembled device orientation within its scene.
- The previous telemetry pack remains available to the aircraft story. Building Dash does not rewrite the TramTrace, telemetry or Pi packs.

## Build and verification

Serve the repository and set `V2_BASE_URL` to that origin. With Playwright available, compile only Dash:

```text
node scripts/build-v2-hero-assets.cjs --model=dash
node scripts/build-v2-hero-assets.cjs --verify --model=dash
```

The build uses a blank compilation surface. It checks reconstructed runtime geometry, materials, textures, transforms and source motion against the full source factory. It also checks the actual idle display frame and compares forward/reverse mechanical poses at ten phases. No browser screenshot is used as a substitute for that geometry check.

The source pacing, prefetch, handoff and choreography suites cover the current hero. Pacing also covers normal poster handoff with the optional decorative loading effect absent. The older fixed-baseline visual-parity suite describes the telemetry-era design; matching those historical pixels is not an acceptance criterion for the intentional Dash replacement. Rendered desktop/mobile framing and controls require current browser review.
