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
12-second fallback). Separate bounded idle tasks construct the scene, attach a
separate telemetry object from the shared transport, draw telemetry, then restore
the landing pose. Real render calls prepare GPU materials and textures. These
draws do not consume landing time, expose intermediate poses or run a continuing
offscreen animation. Entry cancels queued background poses. Reduced motion,
Save Data and short viewports retain readable static imagery without 3D work.

Mouse-wheel interpolation is v2-only, timestamp-based exponential damping at
70ms. Touch stays direct, large consecutive target jumps snap, and explicit
capture seeks remain exact. Native scrolling is never intercepted.

## Selected Work

Four actual Framework card designs use CAD-derived transparent imagery:
ESP32-S3, Dual USB-C, RP2354B and Logic analyser. Their source routes remain
ordinary labelled links. A short, coordinated fan-to-row animation runs once
after decoding and entry, with static reduced-motion/Save Data/no-JS fallbacks.
Keyboard focus, hiding the page or resizing settles the motion immediately.
MetroBoard and TramTrace follow together with real project photography.

The Dual USB-C poster is reproducible with
`scripts/render-framework-dual-poster.cjs`; its adjacent provenance JSON records
the unchanged source asset hashes. No new hardware geometry is invented.

## Acceptance

Serve the repository on port 8080 and run:

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
draws, not merely completed downloads.
