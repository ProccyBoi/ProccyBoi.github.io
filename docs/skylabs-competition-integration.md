# Competition aircraft and sensor study

Unpublished implementation on the existing v2 Skylabs case page at
`/v2/projects/skylabs/#aircraft`. The accepted trainer animation remains at
`/v2/projects/#skylabs-aircraft`, with its runtime and assets unchanged. Both
aircraft are linked; they do not share a simultaneous fly-in.

## Imported sources

The download-host configuration is now enforced and both Library STEP files
were successfully materialized with their Library identity/version attributes.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Proposal_Assembly.step | 14,150,868 | 21028145146887c3709c1ab7d2f4e8a85aa0c7a3d4e6aa551691c18ff82fa695 |
| V2 Assembly.step.step | 757,051 | 2057073d35cac58b3d254028ff1bfc1e79cd587797c888a8f5648ed0df7d315b |

Each model manifest preserves every original occurrence (134 aircraft, 11
mechanism), name, source-space bounds and transform. Tessellation uses 0.2 mm
absolute / 0.15 rad angular deflection. Lossless accessor/mesh deduplication
retains component hierarchy. No geometry is invented to complete the aircraft.
The supplied aircraft includes two empty source nodes (`Wing_leading_edge(Mirror)` and `VT_Rib3`); export keeps their
hierarchy but they cannot generate visible triangles. CAD source colours are
replaced with a restrained presentation palette; geometry is unchanged.

Web delivery uses gzip GLB: 4,227,609 bytes aircraft, 178,695 bytes mechanism.
Uncompressed GLBs and provenance manifests are retained for inspection and
reproduction. `poster.webp` is rendered from the same geometry and camera.

Rebuild with Python 3.12, cadquery-ocp 7.9.3.1.1 and compatible VTK 9.6:

```
python3 scripts/build-skylabs-competition.py /path/to/cad-source
python3 scripts/check-skylabs-mechanism.py '/path/to/V2 Assembly.step.step'
```

The exporter reuses the repository's existing CAD inspection and lossless
compaction utilities. No `.agents` directory or `AGENTS.md` was present in this
checkout. The earlier partial scaffold commits were absent; this implementation
supersedes their overview-only content rather than applying outdated blocker text.

## Mechanical findings and unresolved integration

* Aircraft source spans approximately 1833.632 mm, is 1634 mm long and 617.5 mm
  high in its saved coordinates. These are model extents, not verified flight
  specifications. ESC and other specs remain provisionally the trainer's, as
  requested; no new current rating or performance claim is made.
* Fuselage outer width is 100 mm, with two 3 mm walls: the parallel interior is
  94 mm. The separate mechanism is 360 × 100 × 111.215 mm in its own axes.
  With its length aligned fore/aft, its 100 mm width exceeds this internal
  space by 6 mm (3 mm each side if centred). An exterior installation or revised
  mount might differ; no authoritative assembly-to-aircraft transform exists.
* The proposal still contains `V2TP-Tainer Full Assembly` (three earlier payload
  segments). The new carriage is not silently superimposed on this occupied bay.
* The separate mechanism has source intersections at rest: sensor/right panel
  about 16.823 mm³, plus 1.875 mm³ against each of four bearing guides. These may
  be CAD overlaps or intended contacts, and require designer review.
* A proposed straight downward sensor-only motion is **not a validated release**.
  At 10 mm travel its intersection with Cart V2 is about 3186.605 mm³; at 80 mm
  travel it intersects both side panels. See `clearance-screen.json` for seven
  sampled OpenCascade solid Boolean checks from 0 to 160 mm. No collision is
  detected at the final two samples, which does not establish a clear sweep.
* The animation therefore shows a separate exploded routing study, explicitly
  labelled as needing revision. The 160 mm illustrative separation is not a
  specified actuator stroke. Reversing scroll restores the exact source pose.
* The blue towline is a conceptual closed loop followed by a continuous lead to
  the moving sensor. Its guide station is illustrative. A continuous main carbon
  spar through the fuselage is not positively identified in these exports.
  `Wing_spar` halves stop at the fuselage sides; `CF_Tube_20x20mm` runs aft along
  the fuselage and is not assumed to be the requested main wing spar. A verified
  loop station, line diameter, minimum bend radius, attachment and release path
  are needed before claiming installed routing or cable clearance.
* `Rudder_Assembly` is near the wing/fuselage region, while the vertical tail is
  roughly 1 m aft. The source position is preserved, not corrected by guesswork.
* Main wheels exist, but no tailwheel/strut is identified. The design is described
  as a taildragger per the user; no fabricated tailwheel or ground-contact pose
  is shown. No skin/film surfaces are invented.

This is a geometry and presentation review, not structural or flight-safety
certification. Installed deployment/retraction remains blocked by the supplied
geometry and missing mount/kinematic data, not by file access.

## Runtime and review

Native scroll controls the finite flight/inspection/separation poses in both
directions. No scroll interception or continuous idle animation. Models start
near the section; offscreen/hidden drawing pauses. Reduced motion, Save Data,
short viewports, failed fetch/decompression/WebGL and context loss retain the
CAD poster and readable notes. Preference changes during loading retain the
static view. Canvas is decorative; the heading, caption, issues and source links
remain accessible independently. Mobile framing uses the same actual geometry.

Run the local server on 8080 and `node scripts/verify-v2-skylabs-fleet.cjs`.

Validation completed in Chromium with SwiftShader: desktop 1440×1000 and mobile
390×844 visual inspection; all 145 occurrence nodes and gzip/hash parity; exact
pose and canvas reversal; native scrolling in both directions; offscreen idle;
reduced motion; Save Data; short viewport; failed model request; context loss;
and no-JavaScript poster. No page errors in the fleet suite. Existing
`verify-v2-skylabs.cjs` passed board switching, picking, mobile, stale loads,
context loss and no-JS navigation. `verify-v2-projects-aircraft.cjs` passed the
existing trainer/collection source checks. Whitespace check uses `cr-at-eol`
because the existing HTML retains its original CRLF endings. Browser evidence
is in `.codex-temp/fleet/` (local review captures, not publication).

No push, deployment or public update was performed. The unrelated launch commit
mentioned in prior work is not present here and has not been claimed as included.
