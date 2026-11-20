# Competition aircraft — internal installation revision

This revision updates the published v2 sequence. The trainer and competition taildragger enter together; opaque white/blue Solarfilm covers the competition structure, peels away, and reassembles on reverse scroll. The camera then reveals the internal installation. The carriage lowers 25 mm inside the fuselage with the sensor, then the isolated body clears the belly vertically and trails at a rules-scale distance. Continuing to scroll reels it back in and stows it during flight. Guides and housing remain fixed; the carriage remains aboard. Trainer specifications and the same ESC remain provisional.

## Source identity and units

Both supplied STEP files declare millimetres. Original exported assemblies retain all 134 aircraft and 11 mechanism occurrences, source transforms and hashes in their manifests. Source geometry is not resized. Runtime axis wrappers convert metres to nose +X, up +Y, span Z. `integration.json` records transforms and Library IDs. Build sources: `scripts/build-skylabs-competition.py`, `scripts/extract-skylabs-sensor.py`, `scripts/build-skylabs-film.py`.

The product `Sensor V2, 300mm Length` contains two solids, not just the sensor: solid 0 is the 300 × 63.8 × 63.8 mm body; solid 1 duplicates the separate `Cart V2` (identical 160278.1276 mm³ volume, with a 0.2093 mm X offset). The old animation moved that compound and therefore carried a duplicate cart. The revised runtime suppresses that compound and inserts an independently exported, unaltered solid 0. The original independent Cart V2 stays visible and moves only on its internal lowering stroke. `sensor-identification.json` records bounds and the extracted GLB hash. The previous payload reference and loose duplicate rudder are suppressed; the attached tail rudder remains.

## Internal orientation and fit interpretation

Mechanism source X runs fore/aft, source Z points up. The mechanism centre is [0.36381582, -0.0246424995, 0] metres in centred aircraft coordinates, scale [1,1,1]. Source height maps to aircraft Z 3.5–114.715 mm, within the fuselage height. The 100 mm dimension belongs to the housing envelope; the actual cart is 90 mm wide and sensor 63.8 mm, versus a 94 mm fuselage interior. Housing side faces coincide with the 100 mm outer fuselage envelope and are illustrated as integrated faces. This is an assumed internal installation, not evidence that the original CAD already supplies a finished mounting detail. No parts are silently narrowed, no external cradle, brackets or carbon extension are added.

The wing structure briefly fades from the close-up to keep the internal assembly legible, then returns for the wide tow view. Wing geometry stays fixed during that cutaway. The fuselage sides and housing fade into a stationary cutaway; the floor becomes invisible to explain the sensor exit. This represents a required exit/opening, not a demonstrated door or release mechanism. The source carriage has an assumed 25 mm internal downward stroke; guides remain fixed. The sensor follows that stroke until release, clears the belly vertically and only then trails aft. On recovery it reels back below the exit before rising into the carriage. Stroke length, exit opening and release kinematics are illustrative, not validated mechanical details. Earlier compound-sensor downward Boolean results in `clearance-screen.json` describe the superseded compound and assumed orientation; they do not establish an internal-fit design flaw or validate this revised motion.

## Front notch and towline

The rounded sensor nose is source +X; its tapered tail is -X. BRep circular edges identify a 1.5 mm-radius bore at X 58.540941 and 64.540941 mm, Y -45.720124 mm, Z 57.815001 mm. The tether endpoint uses their centre [61.540941, -45.720124, 57.815001] mm and follows the isolated body rigidly. The visual line is 1.3 mm in the close-up and slightly exaggerated in the wide shot for visibility, not a cable-size specification. A loop encloses the actual named Wing_spar's 3 × 22 mm section with 4 × 14 mm ellipse radii at span Z 55.5 mm. The wider shot follows a separate span from the belly exit to the actual front-notch attachment, with a small visible sag. No bridging spar is invented. Routing and variable cable length are illustrative; guide hardware, friction, strength and flight behaviour are not certified.

## Visual treatment and reference

The reference is the actual Projects hero at `/v2/projects/`, captured at desktop 1440 × 1000 and mobile 390 × 844. The competition uses its environment map, directional lighting and localized diagonal Solarfilm peel kernel. Skins follow source wing rib profiles, tail envelopes and fuselage panel bounds; they are authored covering surfaces, not replacement aircraft geometry. Blue trailing regions and white main panels retain the trainer's visual language. The camera holds a wide composition through the peel, then lowers toward the internal assembly to avoid the earlier wing-obscured close-up. Film remains opaque while attached, with a final fade only after release.

Review captures are generated by `scripts/render-skylabs-competition.cjs`; reference captures are under `.codex-temp/fleet/reference/`. Runtime regression tests check actual rendered reversal, stationary housing, internal vertical cart stroke and sequenced vertical sensor transforms, front-notch attachment, original scale, frame containment, source identity, mobile overflow, native scroll and loading/accessibility fallbacks. This visual explanation is not structural, manufacturing or flight validation.

## Earlier inspected review evidence (superseded payout distance)

[Rendered reference and revised desktop/mobile keyframes](skylabs-competition-review.webp). The sheet contains actual browser renders, not concept images. Reference: wrapped and early peel. Revision: paired wrapped entrance (0.24), curled peel (0.43), lowered carriage and avionics (0.70), vertical sensor-only release (0.82). Full vertical extension (1.0) and intermediate frames were also inspected in both viewports. The comparison led to delayed camera zoom, correct sRGB material conversion, blue wrapped endplates, reduced environment reflections, a lower internal camera and temporary wing cutaway. These changes address washed-out materials, early close-up cropping and wing occlusion found in the first rendered iteration. The revised dedicated scene is brighter than the atmospheric Projects background so the internal mechanism remains legible.

Validation commands: `node scripts/verify-v2-skylabs-fleet.cjs`, `CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/verify-v2-skylabs.cjs`, `python3 scripts/audit-v2.py`, and `V2_BASE_URL=http://127.0.0.1:8080 node scripts/verify-skylabs-fleet-live.cjs` (local delivery byte verification, not publication). Capture scripts: `scripts/render-skylabs-reference.cjs` and `scripts/render-skylabs-competition.cjs`. New compressed sensor/film payload totals 503,243 bytes; loading remains lazy, static preference paths skip models, and offscreen rendering stops.

## Central avionics and revised motion

The actual existing Skylabs telemetry asset (`assets/models/hero/telemetry.bin.gz`) retains its 153 modelled components and 73.03 mm normalization. It sits near the aircraft centre, in the fuselage bay immediately aft of the carriage, at [0.115, -0.025, 0] m, avoiding the sensor swept volume. Four small standoffs illustrate its mounting. The existing trainer electronics factory supplies the same 100A ESC and four KST-X10 Pro-B servos, without adding a second battery/receiver. These ESC/servo shapes were already illustrative trainer hardware, not manufacturer CAD. The ESC occupies the forward bay at [0.605, -0.045, 0] m; servos sit by both flaperons, elevator and rudder. Thin signal harnesses follow the sidewall/spar and tail, with three motor phase leads and short illustrative pushrods.

Only the isolated sensor is lowered and streamed aft; the carriage remains aboard and the guides stay in place. On forward scroll the body returns to its lowered position, then both it and the carriage rise to their stowed poses. The scroll state is reversible and source geometry is unchanged.

The supplied UNSW, Skylabs and Arc artwork is applied to the upper wing film through its existing UVs, so the markings move with the peel and return. The unmodified source images and reproducible atlas build are in `scripts/fixtures/skylabs-livery/` and `scripts/build-skylabs-livery.py`. The Arc input's baked checkerboard was removed within its shield, leaving white artwork on green. If the livery cannot load, the original unmarked film remains available.

The same artwork is also mapped to the trainer's upper wing sheets in the Projects hero and the paired fleet view. In the hero the UVs remain fixed as the film peels and restores; in the fleet the trainer remains assembled. The trainer atlases are generated by the same build script, with opposite spanwise orientation on the two wings so lettering reads correctly from above.

Final checks also assert that the carriage bounding box stays inside the fuselage throughout its stroke and that the board, ESC and servo envelopes do not intersect the sampled sensor path. These envelope checks supplement rendered review; they do not certify the original release hardware.

## Sensor seating refinement

The sensor body is seated 5 mm lower in mechanism source -Z, independently of the aircraft, carriage and electronics. The front-notch coordinate is resolved before applying this illustrative mount offset so that it remains fixed to the original body feature through the entire mission excerpt.

## Responsive camera preview

The v2 fleet starts in a three-quarter formation. The camera follows the competition wing during the peel, moves alongside the carriage, then widens as the tether pays out. Each pose is evaluated from scroll progress, not elapsed time. Portrait and split-screen stages stack the two aircraft rather than cropping the wings; the motion-disabled phone layout reframes the same transparent CAD poster into separate trainer and competition views. No second poster transfer, scene, or model is required. A browser without WebGL retains this still without downloading the fleet models.

The framing changes affect presentation wrappers and camera only. Trainer and competition markings keep their existing upper-sheet UVs. The projects collection’s trainer hero remains unmodified, as do the 25 mm carriage stroke and front-notch attachment. Run the existing fleet regression against a local server: `V2_BASE_URL=http://127.0.0.1:8080 node scripts/verify-v2-skylabs-fleet.cjs`.

## Flight direction and scroll beats

On the Skylabs case study, the leading trainer and trailing competition airframe now approach from depth on separate paths. Their CAD grows through perspective, not an arrival scale animation. Both settle with levelled wings from scroll 0.245 to 0.29 so their markings can be compared. The trainer then banks and climbs out while the chase camera hands the frame to the competition airframe. On portrait stages, the flight paths separate vertically.

The film peel starts at 0.355. The camera moves alongside the carriage for its internal stroke (0.600–0.657). Vertical release starts at 0.684; the sensor then streams aft. From 0.800 through 0.878 the chase view holds the full line and aircraft. The sensor reels back to the same belly exit and rises into the carriage; from 0.979 it is fully stowed while the aircraft remains airborne. The click-free interaction uses the actual sticky inset at each breakpoint and retains reduced-motion / Save-Data / graphics-unavailable stills. Reverse scroll still scrubs all states.

## Mission 3 measurement

[AIAA’s 2026–27 DBF rules](https://aiaa.org/wp-content/uploads/2026/10/DBF-2027-Rules-Final.pdf), §3.1.2, measure the minimum straight-line distance from the aircraft’s towline exit to the forward tip of the sensor. The rendered competition CAD’s two outer endplates bound its span at 1.833631589 m, so the model requires at least 2.750447 m. It holds at 2.750647 m, with 0.2 mm headroom for numerical rounding. The actual sensor nose is the maximum source-X point of its isolated body. That nose point is used for the rule; the tether remains attached to the front notch behind and above it. The illustrative exit shares the stowed notch’s longitudinal/spanwise location and the untouched outer floor plane. Camera and display-only scaling do not change the 1.5 ratio.

Section 3.3.3.3 requires full deployment after takeoff and before the first downwind turn, and a return to internal stow before landing. The excerpt shows deployment, tow and recovery while airborne; it does not depict the entire flight course, sensor light programme, verified retention hardware, or competition eligibility.
