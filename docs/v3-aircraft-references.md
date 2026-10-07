# Skylabs trainer: aircraft reference ledger

Reviewed 7 October 2026 for the v3 landing, disassembly and telemetry sequence. Public photographs were actually viewed in the browser; they are references, not new website assets. No social posts, messages or reactions were submitted and no remote photographs were downloaded.

## Aircraft identity and primary sources

The visual reference is the **UNSW Skylabs Design Build Fly trainer**, identified by the team's [25 September 2026 ICAS post](https://www.linkedin.com/posts/unsw-skylabs_unsw-designbuildfly-icas2026-activity-7509139497305956352-RMTO). The caption identifies the trainer displayed at the AIAA stand in Sydney. All four photographs were inspected, with the second and third also viewed at their native 1024 × 768 size through the public image viewer.

| Photograph in that post | Coverage and observations |
| --- | --- |
| 1 | Team portrait; no useful aircraft geometry. |
| 2 | Best front three-quarter reference. White/ivory high wing with approximately constant chord; box-like light fuselage with UNSW side decals; dark exposed motor; two-bladed front propeller without an obvious spinner or cowl; black wheels on slender metallic legs. The skin has soft reflections and slight surface unevenness. The trophy obscures much of the rear. |
| 3 | Opposite-side view, with the trainer behind people. Confirms the light covering and shows a forward wheel and aft gear. The tail is substantially obscured. The colourful aircraft in the foreground is a separate display, not this trainer. |
| 4 | Wide AIAA booth view; establishes display context, not dimensions. |

The trainer must not silently become **TO-M8R**. The team's [16 April 2026 competition introduction](https://www.linkedin.com/posts/unsw-skylabs_unsw-unswsydney-unswengineering-activity-7450408518593028098-u8zw) explicitly names TO-M8R as its aircraft for that year's competition. That caption was read; its full aircraft photo set was not inspected for reconstruction. Neither the trainer post nor the supplied filenames proves that every component or configuration is identical to the competition aircraft.

The [official UNSW Design Build Fly project page](https://www.unsw.edu.au/challeng/student-projects/explore-student-projects/aiaa-design-build-fly) establishes the team's RC aircraft project and changing annual requirements. Its older aircraft imagery is not used as evidence of this trainer's current geometry. The [official team page](https://au.linkedin.com/company/unsw-skylabs) also distinguishes DBF, VTOL and FPV activities. UNSW Aviation's full-scale training fleet and unrelated “SkyLabs” organisations are outside this reconstruction.

## Local evidence and dimensional precedence

The user supplied `Full_Assembly.step`, `Full_Assembly Drawing v1.dwg` and `Trainer Plane Specifications.xlsx`. The STEP header identifies an Autodesk Translation Framework export made on 7 October 2026. Source assembly geometry and transforms take precedence over perspective estimates from public photos.

The following workbook cells were read in the implementation review. Dimensions are workbook values, not measurements extracted from photographs.

| Sheet and cell | Supplied value | Use |
| --- | --- | --- |
| Requirements Table D4 | High Wing | Overall configuration. |
| Requirements Table D6 | Tricycle | Landing-gear arrangement. |
| Requirements Table D7 | Single Tractor | One propeller at the front. |
| Requirements Table D12 | 1.5 m span | Overall wing check. |
| Requirements Table D14 | Conventional | Tail arrangement. |
| Requirements Table D22 | Top hatch | Access direction; does not specify a photographed hatch outline or fastening system. |
| Sizing I4, I5, I6 | 1.5 m span; 0.44 m chord; SD7032-HL3 | Wing sizing and named section. Use actual STEP rib profiles where available. |
| Sizing L4, L5 | 0.7 m span; 0.22 m chord | Horizontal-tail sizing reference; see discrepancy below. |
| Sizing O4, O5 | 0.4 m height; 0.2 m chord | Vertical-tail sizing reference. |
| Sizing C4 | 17 × 12 in | Propeller specification. Preserve the supplied propeller mesh and scale. |
| Sizing C5 | GA3000.5 380 kv | Motor specification. Preserve supplied motor geometry. |

**Known discrepancy:** the genuine STEP horizontal-tail half, mirrored across the measured centreline, gives a **0.6 m full span**, whereas Sizing L4 says **0.7 m**. Preserve the CAD geometry; do not stretch it to conceal this difference. The source wing half can be mirrored to complete the documented 1.5 m wing. Source coordinates use forward as negative X, up as positive Z, and the measured aircraft centreline at Y = −47 mm.

Only a tiny embedded preview of the DWG was readable in this review. No dimensions, hatch boundaries, gear offsets or mechanical details are inferred from that preview. The workbook and STEP are the dimensional evidence.

## Observed, reconstructed and illustrative parts

| Feature | Evidence level | Implementation constraint |
| --- | --- | --- |
| Existing structural parts, motor and propeller | Supplied STEP | Retain source meshes, local transforms, section profiles and proportions. |
| Missing opposite wing and horizontal-tail side | Reconstruction from genuine half geometry and centreline | Mirror the existing parts. Keep the documented tail-span discrepancy visible in this ledger. |
| Missing main and nose wheels; nose-wheel support | Workbook requires tricycle gear; source main gear is a bracket without tires; public photos show wheels | All three tires, hubs, axles and the nose wire are reconstructions. The chosen 70 mm main tires, 56 mm nose tire and 4 mm nose wire are explicitly inferred, not measured from the photos. Preserve the source bracket and align the reconstructed support with the source nose-mount bore. |
| Light surface covering | Public appearance observed; user requests Monokote/Solarfilm-style skin | Use opaque warm-white film-like surfaces over the structural wing/tail profiles. The photographs do not establish a brand, film thickness or exact seam layout. Avoid glass-like transparency, metallic paint and invented bright stripes. |
| Fuselage decals | Two separate marks visible in photo 2 | A forward red/dark shield above “UNSW” and an aft dark emblem/“UNSW” lockup sit below the wing on the flat forward side. The smaller text is unreadable. Use only matching verified artwork; omitting tiny marks is preferable to inventing a crest or combining the two. |
| Tail boom | Actual STEP structure; photographs largely occluded | Preserve genuine exposed boom geometry. Do not infer a continuous skinned rear fuselage merely to make it look more conventional. |
| Top access | Workbook requirement | A readable opening sequence is justified, but exact hatch fasteners and hinges require CAD evidence. Do not add a photographed-mechanism claim. |
| Telemetry board placement | User states centre of fuselage under the wings; orientation may be arbitrary | Place the real board there for the explanatory sequence. Its presentation orientation is illustrative; no public photo establishes the exact mounting, wiring or standoffs. |
| Landing and disassembly | Website choreography | Present as an explanatory animation, not recorded flight data, an aerodynamic simulation or a claim that the whole aircraft disassembles in that order. |

## Completed covered-model comparison

The opening preview and final covered grounded render were visually compared with the official post's second and third photographs. The covered geometry review is complete. The high, broadly rectangular wings, clean white blunt tips and rounded airfoil leading edges are consistent with the visible reference. There is no photographic basis for elliptical tips or winglets. Perspective views were not used to override CAD dimensions.

The forward covering now extends over the source nose-connector bay to the firewall at source X = −114 mm. This resolves the first preview's exposed X-braced bay and matches the photo's opaque forward side more closely. The genuine underlying bracket and exposed motor remain intact; no spinner or rounded cowl was added. The corrected wing and tail covering removes the first preview's exposed dark and wood patches while preserving the source profiles. Pipeline checks retained all 117 source occurrences and their geometry/transforms, with 17 derived entries recorded separately.

The public photos cannot validate the exposed internal structure in the opening preview. Rear skin boundary, precise nose-gear mechanism, hatch fastening and electronics mounting also remain unresolved. The source carbon tailboom stays exposed. Decals remain omitted because exact matching artwork and the small lettering were not verified. These limits remain documented even though the covered-model visual review is complete; temporary preview lighting was not evidence for material colour or geometry.
