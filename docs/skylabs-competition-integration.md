# Skylabs fleet integration — unpublished review

The v2 Skylabs case page (`/v2/projects/skylabs/#aircraft`) now flies the actual
trainer and competition aircraft into **one shared scene together**. Desktop
uses a diagonal pair; mobile stacks them with separate silhouettes. The trainer exits while the competition aircraft remains for its mounted
sensor deployment and retrieval. Scroll reverses every pose exactly.
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

## Assumed installed deployment and retrieval

The user authorized sensible assumptions to finish the visual story. The scene
now keeps the **actual mechanism mounted to the competition aircraft** throughout,
with no independent resizing. Both STEP assemblies retain their geometry and
relative metre scale. A single presentation scale acts on the whole aircraft,
cradle, sensor and cable. `integration.json` records the placement and assumptions.

The mechanism’s source X is aligned with aircraft nose +X, source Z with up +Y,
and source Y with aircraft −Z. Its centred source envelope sits at aircraft-local
`[0.32, -0.17, 0]` metres. This puts the entire cradle **outside and below** the
fuselage rather than forcing its 100 mm envelope inside the 94 mm wall gap.
The cradle’s highest source point is about 30.64 mm below the fuselage floor;
its forward envelope ends about 73 mm aft of the main-gear envelope. These are
bounding-envelope checks, not installed solid/tolerance or structural validation.
Four restrained authored bracket primitives illustrate support. They are labelled
as assumptions in the manifest; no STEP mesh is modified or secretly shrunk.

The paired entrance moves into a close underside view. Housing parts briefly
fade, separate into a ghosted **cutaway**, and reveal the sensor. They reach their
separated positions before the sensor moves, so the visual does not drive it
through displayed solid panels. The sensor pays out aft and downward, ending
1.25 m aft and 0.36 m below its source position. Once it clears, the housing
returns to the exact original source positions and the camera widens to show the
aircraft towing its sensor. Reversing scroll retrieves it, reopens the cutaway,
returns the sensor to its source pose, and closes the assembly. This is an
illustrated deployment, **not the mechanism’s inferred physical actuation**.
No reel, hinge or actuator is invented to imply validated kinematics.

The original direct-downward motion was rejected as visual storytelling because
it crossed the source cart. Historical `clearance-screen.json` records those
Boolean checks; it is **not** validation of the current cutaway sequence. At the
untouched source pose, the sensor/right-panel common volume is approximately
16.823 mm³ and each bearing-guide overlap approximately 1.875 mm³. All ten
mechanism leaf shapes pass `BRepCheck_Analyzer.IsValid()`. Intended source contacts
or tolerances remain unknown. These minor source overlaps are preserved.

A short assumed carbon cross-member bridges the named wing-spar station:
`[0.32031582, 0.008291693, 0]` metres in centred aircraft coordinates, 12 mm
illustrative diameter and 150 mm length. It is distinct from the existing aft
longitudinal `CF_Tube_20x20mm`. The loop wraps around its outboard extension at
span position 65 mm, outside the approximately 50 mm fuselage half-width.
The continuous lead runs down the outside wall, above the aft cradle edge and
to a fixed local point on the actual sensor occurrence. Every draw transforms
that attachment with the sensor; the cable cannot detach during reverse motion.
A 3 mm visual cable diameter keeps the line readable on mobile. The loop and
member sizes, brackets, mounting location and payout are authoring assumptions,
not measured component specifications. No structural or flight-safety
certification is made. Page copy retains only a restrained illustrative label.

## Runtime, visual review and tests

One new renderer draws both aircraft and the mechanism. Native scroll drives
finite poses; there is no scroll interception or idle loop. Assets begin near
the section. Offscreen and hidden drawing stops. Reduced motion, Save Data,
short viewports, failed downloads, no JavaScript and WebGL loss retain the
rendered fleet poster and readable notes. The whole aircraft rig is scaled for composition; its mechanism-to-airframe
scale remains exactly 1:1. This is not a dimension-comparison view.

Gzip delivery: competition 4,227,609 bytes; mechanism 178,695 bytes; existing
trainer meshopt transport 5,402,507 bytes (approximately 9.81 MB combined, before
helpers). The existing trainer loader supplies its original GLB fallback if
meshopt is unavailable. This is a meaningful loading cost, not a zero-cost reuse
across separate documents. Static preferences skip all three model requests.

Actual desktop 1440×1000 and mobile 390×844 frames were reviewed at arrival,
paired flight, approach, cutaway, payout and fully towed poses. The pair is
visible together and keeps separate silhouettes. A recovered visual issue was
trainer covering depth flicker; this scene now uses a tighter camera depth range
and cloned covering-material polygon offsets, without changing existing trainer
assets or its original story. The mounted cutaway uses a clear aft-quarter underside view; the final lateral
view keeps the trailing sensor and continuous towline distinct on mobile. The poster was regenerated from the corrected
shared scene. The source competition remains skeletal because covering is absent.

Browser evidence lives in `.codex-temp/fleet/`. Tests:

* `node scripts/verify-v2-skylabs-fleet.cjs`: new-source hashes/gzip parity and
  145 nodes; both aircraft present in one frame; desktop/mobile captures; exact
  reversible pose and canvas; original 1:1 mechanism scale; aircraft parenting;
  sensor-to-displayed-housing envelope clearance and sensor framing during payout;
  complete aircraft/sensor framing at full tow; continuously
  attached towline; full retrieval restoring every source pose; native scroll both ways; offscreen idle; reduced
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
superseded by verified imports. The current `integration.json`, model manifests and this report hold the
provenance, provisional ESC/specs and explicit installation assumptions.
The unrelated launch commit is absent and not claimed as included.

The authorized visual storytelling is complete. The supplied housing is shown
in a deliberate cutaway during release; the mounting and physical release/reel
mechanism are not validated. No further user input is needed for this website
illustration. No operation is denied or pending approval. No push, deployment
or publication has been performed.
