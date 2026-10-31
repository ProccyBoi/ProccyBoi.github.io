# Skylabs fleet integration — unpublished review

The v2 Skylabs case page (`/v2/projects/skylabs/#aircraft`) now flies the actual
trainer and competition aircraft into **one shared scene together**. Desktop
uses a diagonal pair; mobile stacks them with separate silhouettes. Both move
out as the separate sensor assembly enters. Scroll reverses every pose exactly.
The existing trainer-only Projects story, its assets and its controller are
unchanged. Its existing loader supplies an independent trainer instance here.

## Sources and fidelity

Both Library files downloaded successfully with identity/version attributes.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Proposal_Assembly.step | 14,150,868 | 21028145146887c3709c1ab7d2f4e8a85aa0c7a3d4e6aa551691c18ff82fa695 |
| V2 Assembly.step.step | 757,051 | 2057073d35cac58b3d254028ff1bfc1e79cd587797c888a8f5648ed0df7d315b |

The manifests preserve all 134 aircraft and 11 mechanism occurrences, names,
source-space transforms and bounds. Tessellation is 0.2 mm absolute / 0.15 rad
angular deflection, with lossless geometry deduplication. Original hierarchy
is retained. Two aircraft nodes have no exportable geometry:
`Wing_leading_edge(Mirror)` and `VT_Rib3`. No replacement competition geometry,
covering or tailwheel is invented. A restrained presentation palette replaces
source colours. The existing trainer retains its accepted authored covering and
reconstructed wheels, as documented in its pre-existing manifest.

The competition still contains the earlier `V2TP-Tainer Full Assembly` payload.
Its `Rudder_Assembly` is near the wing/fuselage rather than the aft vertical tail.
These saved source positions are preserved. No tailwheel is identified; the
competition is called a taildragger per the user, without claiming a verified
ground-contact pose. Trainer specs and ESC remain provisional for competition.

## Measured dimensions versus assumptions

Both STEP geometric contexts explicitly use millimetres: aircraft context
`#187584`, mechanism context `#15303`, each `LENGTH_UNIT` /
`SI_UNIT(.MILLI.,.METRE.)`. OpenCascade inspection records mm; exported glTF uses
metres. The dimension comparison below is **not an installed solid fit check**.

| Source occurrence | Source bounds relevant to width (mm) |
| --- | --- |
| Aircraft `0:1:1:1/0:1:1:1:5`, `Fuselage_Wall` | X = 235.18418 … 238.18418 |
| Aircraft `0:1:1:1/0:1:1:1:4`, `Fuselage_Wall` | X = 332.18418 … 335.18418 |
| Mechanism `0:1:1:1/0:1:1:1:1`, `Left Panel` | Y = −4.7 … 5 |
| Mechanism `0:1:1:1/0:1:1:1:2`, `Right Panel` | Y = −95 … −85.3 |
| Mechanism `0:1:1:1/0:1:1:1:5`, `Cart V2` | Y = −90.720124 … −0.720124 |

The fuselage wall envelope is 100 mm outside, with two 3 mm walls and a
94 mm gap between their inner envelope planes: 332.18418 − 238.18418.
The **whole mechanism's panel envelope**, not `Cart V2` itself, is 100 mm wide:
5 − (−95). `Cart V2` is 90 mm wide. Calling the cart itself 100 mm wide was
imprecise and has been corrected in the page and report.

The separate mechanism's overall envelope is 360 × 100 × 111.215001 mm.
Only **if** its long source X axis is installed fore/aft along aircraft Y, its
width Y across aircraft X, and it lies between those wall envelopes, does the
comparison suggest a 6 mm envelope conflict (3 mm per side if centred).
That orientation and placement are inferred, not supplied or confirmed.
Cutouts, another orientation, a different station or an external mount may change
the result. No authoritative assembly-to-aircraft transform is present, and no
installed Boolean collision test was performed. This is a fit question, **not
proof of a design flaw**.

## Motion and routing evidence

`clearance-screen.json` records OpenCascade BRep Boolean common volumes in the
mechanism's own supplied assembly coordinates, against all other leaf parts,
with a >0.01 mm³ reporting threshold. All ten mechanism leaf occurrences pass
`BRepCheck_Analyzer.IsValid()` in the current source.

At the untouched source pose, the sensor overlaps `Right Panel` by approximately
16.823 mm³ and each of four `Bearing Guide` occurrences by approximately
1.875 mm³. These are source-model overlaps; intended contact/tolerances are
unknown and no operational fault is inferred from them.

For the animation, an **illustrative sensor-only translation along source −Z**
was sampled at 0, 10, 20, 40, 80, 120 and 160 mm. At 10 mm it intersects `Cart V2`
by approximately 3186.605 mm³. At 80 mm it intersects both side panels; the final
two samples have no reported intersections. This proves intersections only for
that assumed path, not for the actual mechanism's unknown deployment motion.
It is not a continuous sweep, joint solver, actuator-stroke calculation or
installed aircraft test. The page therefore calls the animation an exploded
routing study and explicitly states the actual release motion is unconfirmed.

The blue towline is a continuous schematic loop and lead to the moving sensor.
Its loop station is illustrative, not measured mounting hardware. The user asks
for a loop around the main carbon spar; a continuous main carbon spar through
the fuselage has not been positively identified. The exported `Wing_spar` halves
stop at the fuselage sides. `CF_Tube_20x20mm` runs aft longitudinally and is not
silently assumed to be the main wing spar. A confirmed mount transform, actual
release motion, loop station, attachment and cable dimensions are needed for
installed routing/clearance. No structural or flight-safety certification is made.

## Runtime, visual review and tests

One new renderer draws both aircraft and the mechanism. Native scroll drives
finite poses; there is no scroll interception or idle loop. Assets begin near
the section. Offscreen and hidden drawing stops. Reduced motion, Save Data,
short viewports, failed downloads, no JavaScript and WebGL loss retain the
rendered fleet poster and readable notes. The geometry is scaled for composition;
this is not a dimension-comparison view.

Gzip delivery: competition 4,227,609 bytes; mechanism 178,695 bytes; existing
trainer meshopt transport 5,402,507 bytes (approximately 9.81 MB combined, before
helpers). The existing trainer loader supplies its original GLB fallback if
meshopt is unavailable. This is a meaningful loading cost, not a zero-cost reuse
across separate documents. Static preferences skip all three model requests.

Actual desktop 1440×1000 and mobile 390×844 frames were reviewed at arrival,
paired flight, transition, mechanism and separated-sensor poses. The pair is
visible together and keeps separate silhouettes. A recovered visual issue was
trainer covering depth flicker; this scene now uses a tighter camera depth range
and cloned covering-material polygon offsets, without changing existing trainer
assets or its original story. An initially empty mobile transition was corrected
by bringing the mechanism up into view while the aircraft leave. The poster was regenerated from the corrected
shared scene. The source competition remains skeletal because covering is absent.

Browser evidence lives in `.codex-temp/fleet/`. Tests:

* `node scripts/verify-v2-skylabs-fleet.cjs`: new-source hashes/gzip parity and
  145 nodes; both aircraft present in one frame; desktop/mobile captures; exact
  reversible pose and canvas; native scroll both ways; offscreen idle; reduced
  motion; Save Data; short viewport; failed download; context loss; no-JS poster.
* `CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/verify-v2-skylabs.cjs`:
  existing board switching/picking, pending races, responsive layout, context
  loss and no-JS navigation.
* `node scripts/verify-v2-projects-aircraft.cjs`: existing trainer/collection
  source checks. No trainer asset/controller changes.
* JS syntax and `git -c core.whitespace=cr-at-eol diff --check`; original HTML
  CRLF preserved.

Rebuild with Python 3.12, cadquery-ocp 7.9.3.1.1 and compatible VTK 9.6:
`python3 scripts/build-skylabs-competition.py /path/to/cad-source`.
The geometry checker is `scripts/check-skylabs-mechanism.py`; regenerate posters
with `node scripts/render-skylabs-competition.cjs` and a server on port 8080.

## Scope and remaining questions

The earlier overview-only scaffold patch was provided, but its commits were not
in this checkout. Its intended source references, trainer preservation,
competition/taildragger description, provisional trainer/ESC specs, integration
notes and verification are covered here. Its historical access blocker is
superseded by verified imports. No separate stale `integration.json` is added;
the model manifests and this report hold the current provenance and findings.
The unrelated launch commit is absent and not claimed as included.

Installed, mechanically valid deployment/retraction remains unresolved because
mounting and kinematics are unknown. That action is pending CAD clarification,
not denied and not executed with an uncertain outcome. Both aircraft fly in
coordinately now; no source geometry is moved to guess a final installation.
No push, deployment or publication has been performed.
