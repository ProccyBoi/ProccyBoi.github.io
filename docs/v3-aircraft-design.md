# Skylabs aircraft story

The v3 homepage follows one physical object: a trainer approaches, lands and stops; native scrolling opens its structure and brings the telemetry board beneath the wing into view. The existing project routes and v2 are unchanged by this controller. The three short chapters are **Aircraft**, **Inside**, and **Telemetry**. The middle chapter sits above the opening structure; the final desktop chapter sits beside the board.

## Geometry and provenance

The aircraft derives from `Full_Assembly.step`. Its manifest retains all 117 source occurrences and records additions separately. The user authorized mirroring the supplied wing and horizontal-tail halves, creating covering film from the structural envelopes, and reconstructing the missing main wheels and nose gear at the existing mounting regions. Wheel dimensions and the nose linkage are plausible reconstructions, not measured hardware. The exposed motor, original propeller, carbon tailboom and source tail dimensions remain intact. See [the reference ledger](v3-aircraft-references.md) and `assets/models/aircraft/skylabs-trainer/manifest.json` for source evidence and limitations.

The scene uses metres, nose +X, up +Y and span Z. The telemetry board retains its existing prepared CAD geometry, maps and component placement. It is scaled to its actual 73.03 × 57.05 mm outline, positioned at the supplied under-wing mount, and exposed by moving the surrounding aircraft. The final enlargement is a camera move; the board never becomes an oversized object inside the fuselage.

## Motion and light

The automatic approach lasts 5.4 seconds of visible playback. The camera tracks the incoming aircraft, the main wheels contact first, the nose settles and the rollout decelerates to rest. Contact calculations use the actual tire vertices and the manifest's final two-degree pose. Propeller rotation is about the source shaft, including its offset from the exported node origin. No simulated flight statistics or unverified suspension travel are presented.

The scroll sequence is deterministic: film first, then unequal wing and tail offsets, followed by the fuselage and propulsion structure. The board leaves its mount while the airframe recedes from view. Every pose derives from saved source transforms, so reversing the scroll restores the exact assembly. Camera fitting retains the entire opaque aircraft until the intentional close-up begins. Mobile uses its own composition and responsive poster.

The renderer uses the existing product-studio environment and lights. The moving shadow frustum tightens from the aircraft to the 73 mm board. The floor receives a separate low-contrast contact-shadow layer; PCB self-shadows remain physical. Camera near distance increases for the wide view to avoid depth fighting between the thin film and wooden structure, then tightens for the small board. Source geometry is unchanged by these lighting and camera choices.

## Loading and access

A real, responsive stopped-aircraft poster and all three chapters are native HTML. Enhancement swaps to the approach poster while loading. The preferred aircraft transport uses lossless meshopt compression: every decoded geometry buffer is identical to the original GLB. Unsupported or failed decoding falls back to that original file. The telemetry pack starts after the aircraft transport and decode complete, allowing the first landing frame to appear sooner. If scrolling reaches the board before it arrives, the view holds on the open aircraft and advances as soon as the actual board is ready.

Scrolling, touch movement or navigation keys interrupt the landing immediately. A keyboard-accessible **Skip landing** button is available during playback. The stage anchors use native scrolling and retain their hash destinations; no wheel or touch scrolling is captured. All frames are event-driven after the finite landing. Hidden, offscreen and idle scenes stop requesting frames.

Reduced motion, Save Data, short viewports, missing JavaScript, failed dependencies and lost WebGL contexts use the compact static story. The actual populated telemetry photograph and project links remain available. Preference changes from deep in the story preserve the active chapter. The optional `?capture` API exists only for exact production poster capture and acceptance checks; ordinary page visits expose no scene diagnostic global.

## Verification

`scripts/verify-v3-aircraft.cjs` exercises the real page, real asset transport and real prepared telemetry model. It checks autoplay and interruption, native keyboard navigation, physical wheel contact and propeller axis, exact reverse assembly, desktop/mobile framing, deferred-board behaviour, static fallbacks and renderer lifecycle. It saves screenshots and a machine-readable evidence file under the ignored `.codex-temp/v3-aircraft/` directory. Run with `--static-only` or `--scene-only` to isolate the two groups. `scripts/audit-v3.py` independently validates routes, manifest integrity and aircraft transport assets.

All 13 browser acceptance groups passed on 7 October 2026, including 1440 × 900, 390 × 844 and 320 × 740 scene layouts, plus the 844 × 390 compact fallback. Wheel contacts were within floating-point error of ground level; the propeller shaft stayed fixed; reverse assembly restored every tested part matrix exactly. Main-contact forward velocity is continuous across the approach/rollout boundary. No browser exceptions or shader errors were recorded.
