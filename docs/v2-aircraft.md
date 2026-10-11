# Skylabs aircraft and Selected Work in v2

The aircraft story follows Selected Work and precedes About. The opening
three-project composition stays intact. The detailed story uses the accepted
v3 aircraft geometry, film peel and telemetry extraction, with two namespaced
anchors: `#skylabs-aircraft` and `#skylabs-telemetry`. Film is fully gone at .60;
rigid exterior motion begins after .62. Those scene mechanics are unchanged.

## Background readiness

Only v2 opts into `data-aircraft-background`. The three opening model packs
download concurrently. Selected Work has real eager HTML image sources and
explicit decode tracking; no image source is withheld until intersection.
Aircraft scripts and its decoder prepare without scrolling. The larger aircraft
transfer starts after all three hero raw transfers settle, or a 4.5-second
fallback. Entry and deep links bypass that gate immediately; shared promises
prevent duplicate model and decoder requests.

Offscreen construction waits for the foreground model set to settle (with a
12-second fallback), then for Selected Work to finish or fall back (18-second
starvation timeout, reported separately from success). Aircraft entry bypasses
that CPU ordering; its downloads stay concurrent. Separate bounded idle tasks construct the scene, attach a
separate telemetry object from the shared transport, draw telemetry, then restore
the landing pose. Real render calls prepare GPU materials and textures. These
draws do not consume landing time, expose intermediate poses or run a continuing
offscreen animation. Entry cancels queued background poses. Resumed warming immediately hides the
canvas and restores its poster; only a successful current live draw unmasks it.
Reduced motion,
Save Data and short viewports retain readable static imagery without 3D work.

Mouse-wheel interpolation is v2-only, timestamp-based exponential damping at
70ms. Touch stays direct, large consecutive target jumps snap, and explicit
capture seeks remain exact. Native scrolling is never intercepted.

## Selected Work

Six genuine assemblies share one viewport-sized canvas, renderer, scene and
camera. ESP32-S3, Dual USB-C, RP2354B and Logic analyser form one composition;
a continuous pullback and pan carries the same space into MetroBoard and
TramTrace together. Real PCB, electronics, connector and screw groups seat
reversibly over the first .311 of scroll; the camera journey begins afterward.
Dual connector/screw views use verified provenance ranges and share the original
attributes, indices and materials. Assembled source poses are restored exactly.
The transit camera looks down at roughly 63–65 degrees for legibility. One world
unit is 30 mm, retaining relative physical board sizes. Mobile rearranges the
quartet into two rows and the transit pair vertically. Native chapter anchors
and all six ordinary project links remain keyboard accessible.

The new `V2SelectedAssets` reader loads four verified compressed source packs;
Pi and TramTrace reuse the opening hero transport cache but get independent
Object3Ds, materials and GPU resources. Dual USB uses the complete existing
procedural inspector assembly, with compatible opaque meshes batched without
triangle decimation. Its visible board-edge lines are preserved. MetroBoard
retains the existing dimensioned representations of 291 LEDs; unavailable
supplier LED CAD and J1/U2/U5 bodies are not invented. A shared factory bugfix
defaults omitted zero-angle placements to zero rather than NaN. Hero model
bytes and the accepted aircraft scene geometry are unchanged.

Scripts, original fallback images and silk textures prepare without scrolling.
The four new geometry transfers start after all three hero transfers settle or
a 4.5-second timeout, with immediate entry promotion. CPU reconstruction yields
between models after the foreground settles. GPU preparation is also staged:
six real model-only draws use a 64-pixel long-side buffer with the final lights,
materials and shadows, followed by two complete 640-pixel composition draws.
Each stage yields to input and waits on an owned WebGL2 fence using zero-timeout
polling. An initial fence avoids immediately forcing queued work into a new
synchronous render call. No production code calls `gl.finish`.

Early entry promotes the same masked queue instead of bypassing it with a cold
full-scene draw. Completed model stages survive interruption; canceled stages
resume safely. Hide, pagehide, preference changes and context loss release owned
syncs. A 12-second fence timeout restores static fallback rather than claiming
completion. WebGL1 retains finite staged preparation but reports `unsupported`
GPU completion honestly. Only a completed full-size current-target live draw
reveals the canvas. Live frames are similarly paced one at a time, sampling the
latest native-scroll target when free, with no queued wheel replay. Pose/layout
revisions prevent a stale completion from stranding touch, jump or resize input.

Separate counters distinguish model preparation, composition submissions and
completed composition poses. Bounded per-stage measurements record CPU draw
work, program counts and asynchronous completion waits. The first full-size
frame still has its own allocation/fill cost; preparation does not make it free.
Compatible opaque MetroBoard and TramTrace meshes are batched only in
Selected Work's separate instances; transparent meshes and source hero packs
remain unchanged. Batching yields between construction slices and cancels
transactionally when the page or motion preference no longer permits work.
Hidden/offscreen scenes have no continuing render loop. The page has
three WebGL contexts total: hero, Selected Work, and aircraft. Preference changes
restore the original static collections; renderer reuse avoids context growth.

Reduced motion, Save Data, short viewports, missing DecompressionStream, no JS,
or failed WebGL retain the six original images and source links. The images are
posters/fallbacks only; the enhanced presentation is actual volumetric geometry.
Pack provenance and exact source hashes are in `assets/models/selected/`;
`scripts/build-v2-selected-assets.cjs` reproduces and verifies the assemblies.

## Acceptance

Serve the repository on port 8080 and run:

- `node scripts/verify-v2-gpu-preparation.cjs`: deterministic fence ownership,
  cancellation, timeout, unsupported-path and exactly-once cleanup checks.
- `node scripts/verify-v2-selected-scene.cjs`: real six-model parity, shared
  camera framing/reversal, three-context budget, native input and lifecycle.
  `--source-only` needs no browser; `--study` captures desktop/mobile renderings.
- `node scripts/verify-v2-background.cjs`: no-scroll image decode and finite GPU
  preparation, delayed/failing transport, early entry, deep links and fallbacks.
- `node scripts/verify-v2-aircraft.cjs`: entry landing, accepted CAD/peel, reverse,
  capture, native hashes/focus, shared telemetry, mobile and v3 regression.
- `node scripts/verify-v2-wheel.cjs`: wheel, touch, reversal and lifecycle checks.
- `node scripts/verify-v2-polish.cjs`: responsive routes, navigation and pictures.

The review workflow also exercises Book with mocked submissions, WebKit mobile
emulation, source/transport contracts and matched three-run cold-cache profiles.
Performance compares current published v2 at 10Mbps/40ms on the same runner;
the wheel-only historical comparison uses the original unfiltered controller.
Chromium uses software WebGL, so timing evidence does not prove hardware-GPU FPS
or physical-iOS performance. Readiness requires decoded images and real warm
draws, not merely completed downloads. `verify-v2-background.cjs --profile-only`
records a full cold 10Mbps/40ms trace through Selected completion and aircraft
warm submissions. Old Selected readiness marked submission; the paced controller
marks fence completion on WebGL2. Label this stricter milestone when comparing
readiness times. Compare blocking tasks and native input response separately.
Fast arrival can still precede preparation; posters and priority promotion cover
that path. No test result claims instant loading or hardware-GPU frame rates.
