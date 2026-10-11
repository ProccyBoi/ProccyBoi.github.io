# V3 tactile hardware folio

11 October 2026. Review-branch implementation for the existing public preview.
The canonical GitHub Pages main branch is not changed by this preview.

## Composition

The opening is Andrew's actual hardware, rather than a large name followed by a
copy of v2's gallery. A compact identity keeps electrical engineering, UNSW and
Sydney visible. The selected project has an attached factual description and a
case-study destination. Three physical-looking photograph sheets provide depth,
direct selection and horizontal drag/swipe. The index and arrow buttons are equal
ways to select; no visitor has to discover a gesture.

TramTrace's copper comparison replaces the photograph in the same exploration
area. It does not add another long section. Skylabs's accepted aircraft-to-telemetry
scene follows the folio and remains directly linked from its project panel. The
page ends with three smaller builds, a short profile and contact/CV destinations.
Assignment tools are not promoted. Existing project interiors, canonical files,
booking, flight review and the 15-project collection retain their routes.

## References applied, and what actually runs

| Original material | Visible implementation | Runtime adoption |
| --- | --- | --- |
| [Kokonut Card Stack](https://kokonutui.com/docs/cards/card-stack), [source](https://github.com/kokonut-labs/kokonutui/blob/main/components/kokonutui/card-stack.tsx) | Overlapping, offset photographs reorder into the foreground. The selected sheet follows horizontal dragging; other projects remain directly selectable. A phone composition preserves a next-card edge and explicit arrows. | Independently authored native controller/CSS. No Kokonut React component is installed or copied. |
| [Kokonut Smooth Tab](https://kokonutui.com/docs/navigation/smooth-tab) | Selection, exposed project names and a continuous selected-state marker remain synchronized. | Native semantic tabs and CSS transforms. |
| [Motion Primitives Transition Panel](https://github.com/ibelick/motion-primitives/blob/main/components/core/transition-panel.tsx) | The selected description and caption enter together with the card change. New selections cancel earlier text motion. | Native state ownership, with the already-vendored Anime.js timeline; Motion Primitives is not a runtime dependency. |
| [Motion Primitives Image Comparison](https://github.com/ibelick/motion-primitives/blob/main/components/core/image-comparison.tsx) | A draggable split reveals copper routing and board artwork in the same registered frame. | Independently authored SVG clipping plus a labelled native range input, adding keyboard operation. |
| [Anime timeline positions](https://animejs.com/documentation/timeline/time-position/) | Named `selected` timeline coordinates panel, count and caption offsets; selection semantics update immediately. | Actual self-hosted Anime.js 4.5.0, optional dynamic import from `assets/vendor/anime.esm.min.js`, with its retained MIT notice. Failure falls back to native animation; reduced motion skips staging. |
| [Motion performance](https://motion.dev/docs/performance) | Transform/opacity motion, no idle folio loop, direct range updates, interruption handling. | Design/performance guidance, not a claim that Motion is installed. |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) | Image-first hierarchy, distinct opening composition, coherent material treatment and explicit responsive states. | Composition/review guidance only. No generated replacement hardware or invented claims. |

These links were re-read during this attempt. Historical `DESIGN.md` at `81fe1c8`
contains the earlier tactile-stack intent. Later decisions to exclude stacks or
avoid specific frameworks were implementation choices, not user requirements.
The implementation chooses a bounded static approach because it supports this
site's actual interactions; it does not claim that every reviewed library was used.

## Evidence and registration

Photographs are existing authorized derivatives. TramTrace uses `tramtrace-hero`
and `tramtrace-controller`; Skylabs uses `skylabs-telemetry-hero` and
`skylabs-telemetry-macro`; Dual USB-C uses `framework-dual-installed` and
`framework-dual-ports`. Overview/detail pairs are different photographs. They are
switched, not falsely overlaid as registered before/after images.

The copper comparison exclusively uses the original export family:

- `assets/images/interactive/tramtrace/tramtrace-front-copper.svg`
- `assets/images/interactive/tramtrace/tramtrace-front-mask.svg`
- `assets/images/interactive/tramtrace/tramtrace-front-silk.svg`

Each retains `viewBox="0 0 223.7486 111.1758"` and identical placement. F.Mask is
an openings export. Exposed pads are the intersection of those openings and actual
front copper; silkscreen remains the source drawing. Colours illustrate the layers.
This is not a photograph, factory process recording or measured electrical result.
The separate normalized manufacturing SVG family is not mixed into this frame.

Project statements are bounded by the original case studies and
`scripts/content/v3-case-evidence.json`. No performance, compliance, reliability
or live flight measurements have been added.

## Resilience

Native links and photographs survive without the folio script. Reduced motion
retains selection and all detail modes. Pointer capture begins only after a
horizontal intent threshold, leaving vertical touch scrolling native. The range
has keyboard, pointer and touch operation independent of folio selection. Photo
loading uses revision checks so slow older requests cannot replace a newer state.
The existing full-size photo inspector retains its guarded touch-close fix,
keyboard focus behavior, zoom/pan limits and failure/retry states.

The accepted aircraft source/controller remains unchanged. Only its placement and
subordinate introduction change; viewport-deferred loading uses its existing
supported mode. Skin clearance still precedes rigid separation, with only Aircraft
and Telemetry destinations. There is no Anatomy chapter or numbered overlay.

## Validation

Run the existing geometry/source suites, route audit and generated-interior check,
then `scripts/verify-v3-portfolio.cjs` against the exact review commit. See
`docs/v3-folio-validation.md` and the matching workflow artifact for actual results.
This design note does not declare unrun checks passed.
