# Skylabs aircraft and Selected Work in v2

The aircraft story follows the Framework composition and continues into the
power, measurement and flight links before About. The opening composition is
TramTrace, the complete Dash device and the Pi card. The detailed story uses the accepted
v3 aircraft geometry, film peel and telemetry extraction, with two namespaced
anchors: `#skylabs-aircraft` and `#skylabs-telemetry`. Film is fully gone at .60;
rigid exterior motion begins after .62. Those scene mechanics are unchanged.

## Loading and proximity preparation

The v2 homepage opts into `data-aircraft-background`. At the opening, the three
hero packs can download concurrently. Direct links to later sections defer hero
startup until the opening is approached again. Selected Work and aircraft keep
real lazy HTML image sources with explicit decode tracking; their extra source
helpers, geometry transfers and reconstruction begin only near the relevant
section or on explicit navigation. Native image lazy-loading may fetch a poster
before the application gate; it does not start a 3D scene.

Once a secondary scene is eligible, its transfer can wait for an already-started
hero's raw bytes, with a 4.5-second fallback. Entry and deep links promote the
requested scene; a hero intentionally left unstarted cannot block it. Shared
promises prevent duplicate model and decoder requests.

Secondary source loading, construction and GPU preparation require section proximity or
explicit scene intent. Proximity is an absolute section top below twice the
viewport height and a section bottom above minus one viewport height. This is
one viewport of advance preparation, not two viewports beyond the visible edge.
A distant untouched page keeps secondary model transfers, reconstruction and
renderers unstarted. Once requested, completed stages are retained for re-entry.

Eligible offscreen construction waits for the foreground model set to settle
(with a 12-second fallback). Aircraft waits for actively requested Selected
preparation (18-second starvation timeout), but reports a deferred sibling rather
than waiting for intentionally unrequested work. Ready/static/failed outcomes
retain their real diagnostics. Aircraft entry bypasses that CPU ordering; its downloads stay concurrent. Separate bounded idle tasks construct the scene, attach a
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

Four genuine assemblies share one viewport-sized canvas, renderer, scene and
camera: ESP32-S3, Dual USB-C, RP2354B and Logic analyser. Real PCB, electronics,
connector and screw groups assemble and separate reversibly. The former transit
pair is no longer loaded by this homepage section.
Dual connector/screw views use verified provenance ranges and share the original
attributes, indices and materials. Assembled source poses are restored exactly.
One world unit is 30 mm, retaining relative physical board sizes. Mobile
rearranges the quartet into two rows. The native chapter anchor and all four
ordinary project links remain keyboard accessible.

The `V2SelectedAssets` reader loads the Framework assemblies; Pi reuses the
opening hero transport cache but gets independent Object3Ds, materials and GPU
resources. Dual USB uses the complete existing
procedural inspector assembly, with compatible opaque meshes batched without
triangle decimation. Its visible board-edge lines are preserved. A shared factory
bugfix defaults omitted zero-angle placements to zero rather than NaN. The
accepted aircraft scene geometry is unchanged by the loading gates.

Source helpers, fallback-image decoding and geometry transfers follow section
proximity or explicit intent. Eligible transfers wait for already-started hero
transfers or a 4.5-second timeout, with immediate entry promotion. CPU reconstruction yields
between models after the foreground settles. Moving away cancels owned pending
stages and pauses reconstruction; completed stages are retained for re-entry. GPU preparation is also staged:
four real model-only draws use a 64-pixel long-side buffer with the final lights,
materials and shadows, followed by two complete 640-pixel composition draws.
Each stage yields to input and waits on an owned WebGL2 fence using zero-timeout
polling. An initial fence avoids immediately forcing queued work into a new
synchronous render call. No production code calls `gl.finish`.

Early entry promotes the same masked queue instead of bypassing it with a cold
full-scene draw. Completed model stages survive interruption; canceled stages
resume safely. Hide, pagehide, preference changes and context loss release owned
syncs. A 12-second submitted-work fence timeout restores static fallback rather than
claiming completion; the initial, separately reported queue drain allows up to
30 seconds for previously queued work. Both waits remain cancelable and
nonblocking. WebGL1 retains finite staged preparation but reports `unsupported`
GPU completion honestly. Only a completed full-size current-target live draw
reveals the canvas. Live frames are similarly paced one at a time, sampling the
latest native-scroll target when free, with no queued wheel replay. Pose/layout
revisions prevent a stale completion from stranding touch, jump or resize input.

Separate counters distinguish model preparation, composition submissions and
completed composition poses. Bounded per-stage measurements record CPU draw
work, program counts and asynchronous completion waits. The first full-size
frame still has its own allocation/fill cost; preparation does not make it free.
Compatible opaque meshes are batched in Selected Work's separate instances;
transparent meshes and source hero packs remain unchanged. Batching yields between construction slices and cancels
transactionally when the page or motion preference no longer permits work.
Visible work has priority in both directions. Selected preparation pauses at
CPU and GPU boundaries while the aircraft is actually visible; aircraft
preparation does the same while Selected is visible. Downloads remain
concurrent. Visibility/priority events resume incomplete work without a polling
render loop. Aircraft proximity alone no longer bypasses this optional CPU
order; genuine entry still promotes its accepted live animation immediately.
Its two offscreen poses use a capped 640-pixel buffer and owned completion fences.
The v2 aircraft's live draws share that same single GPU owner: entering cancels
and settles background work, drains any already-submitted commands, then draws
the latest native pose. Live completion is polled without blocking, at 4 ms;
background polling remains 16 ms. Size and DPR changes wait until the next owned
draw rather than clearing an in-flight buffer. Captions, progress and published
frame metadata advance together after completion. Ordinary wheel/touch input
never flashes the poster; discontinuities and resize retain coverage until a
current full-size pose is complete. Actual submitted/completed records remain
available even when an older completion cannot be published as the current pose.
The first masked preparation/drain does not spend the unseen landing; once the
first pose is revealed its original 5,400 ms visible wall-clock timeline resumes,
including slow frames, with hidden time excluded. Every live aircraft draw
restores its original DPR, geometry and choreography. This is v2-only; the v3
controller retains its existing synchronous path. The opening v2 hero also has
one-in-flight backpressure, preventing any of the three renderers from building
an unbounded queue of obsolete frames.
Hidden/offscreen scenes have no continuing render loop. The page has
at most three WebGL contexts total: hero, Selected Work, and aircraft. Preference changes
restore the original static collections; renderer reuse avoids context growth.

Reduced motion, Save Data, short viewports, missing DecompressionStream, no JS,
or failed WebGL retain the four original images and source links. The images are
posters/fallbacks only; the enhanced presentation is actual volumetric geometry.
Pack provenance and exact source hashes are in `assets/models/selected/`;
`scripts/build-v2-selected-assets.cjs` reproduces and verifies the assemblies.

## Framework card inspection

The shared Framework quartet has wider physical layer separation. Its optional
inspection layer reuses the same CAD, renderer and bounded GPU queue: hovering
or keyboard-focusing a card previews it closer, and clicking or tapping pins the
selection. Clicking that card again, choosing **Show all cards**, or pressing
Escape returns to the quartet. Arrow keys move between card controls; normal Tab
navigation and the existing project links remain independent.
Projected hit regions are partitioned at shared quartet midpoints, so an enlarged
card cannot cover another card's native tap target. Every target stays at least
44 CSS pixels and all-pairs browser checks verify actual centre ownership without
moving the document.

Inspection weights compose with the original reversible part assembly and fade
out before the transport chapter. Offscreen or static-preference changes reset
the selection. A first reveal after a masked resize adopts the latest selection;
already-visible transitions coalesce behind the existing single pending frame.
Only real pointer movement changes hover selection, so moving hit bounds cannot
oscillate it. The controller stops requesting frames when scroll and inspection
both settle. No new model, texture, renderer or continual animation is added.

## Shorter browsing paths

The opening hero uses 210svh total on desktop and 200svh in the smaller-screen
enhanced layout. Selected Work's native-scroll travel is 1.15 stage heights;
v2 Skylabs uses 1.8/2.1. Normalized CAD choreography
and accepted aircraft peel timing remain unchanged; v3 keeps its original track.

Quick overview and CV are available on the first screen. Native buttons select
hero scenes; the independent project link always navigates. The three-project
overview and compact Inside the builds links precede the Framework composition.
The repeated full-size Kiku feature is removed; `#work-kiku` points to its
overview row. The aircraft's Skip animation link moves forward to
`#engineering-range`. Framework project
descriptions stay visible on mobile, with responsive framing above their text.
The About booking action stays in /v2/book/ and Contact consistently targets the
v2 About contact section. Evidence records in scripts/content/v2-case-evidence.json
add only published decisions, maturity and measured outcomes. A build-only v3
filter excludes these explicitly v2-scoped additions, preserving existing v3 bytes.

Initial lab measurement and scene-entry readiness are separate horizons. The
absence of distant GPU work is not a claim that an unprepared scene is ready.
SwiftShader/Lighthouse-style lab metrics do not establish physical-device or
field Core Web Vitals. Existing poster, asynchronous fence and input-priority
limitations still apply.

## Acceptance

Serve the repository on port 8080 and run:

- `node scripts/verify-v2-gpu-preparation.cjs`: deterministic fence ownership,
  cancellation, timeout, unsupported-path and exactly-once cleanup checks.
- `node scripts/verify-v2-hero-pacing.cjs`: held real hero fences, late-model
  poster handoff, newest native target, resize and lifecycle cleanup.
- `node scripts/verify-v2-aircraft-pacing.cjs`: one shared warm/live owner,
  held real aircraft fences, landing clock, current-size reveal and cancellation.
- `node scripts/verify-v2-framework-inspection.cjs`: physical separation, native
  hover/focus/tap, overview/Escape, mobile bounds and held-GPU selection recovery.
- `node scripts/verify-v2-selected-scene.cjs`: shared
  camera framing/reversal, three-context budget, native input and lifecycle.
  `--source-only` needs no browser; `--study` captures desktop/mobile renderings.
- `node scripts/verify-v2-proximity-loading.cjs`: controlled production-gate
  scenarios for distant scenes, explicit entry and lifecycle changes, without a browser.
- `node scripts/verify-v2-background.cjs`: proximity-gated source loading and
  finite GPU preparation, delayed/failing transport, early entry, deep links and fallbacks.
- `node scripts/verify-v2-aircraft.cjs`: entry landing, accepted CAD/peel, reverse,
  capture, native hashes/focus, shared telemetry, mobile and v3 regression.
- `node scripts/verify-v2-wheel.cjs`: wheel, touch, reversal and lifecycle checks.
- `node scripts/verify-v2-polish.cjs`: responsive routes, navigation and pictures.

These commands describe available checks, not a record that they have all run
against the current revision. Older fixed-baseline scene checks can still encode
the former six-model composition and must not be presented as current coverage
without examining their assertions and results.

The review workflow also exercises Book with mocked submissions, WebKit mobile
emulation, source/transport contracts and matched three-run cold-cache profiles.
Performance compares current published v2 at 10Mbps/40ms on the same runner;
the wheel-only historical comparison uses the original unfiltered controller.
Chromium uses software WebGL, so timing evidence does not prove hardware-GPU FPS
or physical-iOS performance. Readiness requires decoded images and real warm
draws, not merely completed downloads. `verify-v2-background.cjs --profile-only`
records a full cold 10Mbps/40ms trace through both paced preparation completions
(on WebGL2). Old Selected readiness marked submission; the paced controller
marks fence completion on WebGL2. Label this stricter milestone when comparing
readiness times. Compare blocking tasks and native input response separately.
Fast arrival can still precede preparation; posters and priority promotion cover
that path. No test result claims instant loading or hardware-GPU frame rates.
