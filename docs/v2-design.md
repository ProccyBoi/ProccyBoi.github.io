# V2 — hardware, inside and out

Revised 7 October 2026. The portfolio lives at `/v2/` and contains 15 projects, including the expanded electronics collection and Coaster. The standalone browser tools are not presented as portfolio projects.

## Visual direction

The theme is the physical assembly. Board outlines, copper, chips and connectors provide the shapes and colour; the surrounding page uses warm charcoal, chalk-white text and a restrained vermilion accent. Dark image surfaces suit the original black-background photographs. There are no decorative circuit traces, fabricated component labels or artificial engineering readouts. Separation between sections leaves enough space to see how the parts relate.

The opening is a full-screen, scroll-controlled scene led by TramTrace, followed by Skylabs telemetry and the Raspberry Pi card. It starts with all three boards, moves one into focus, separates its actual components, then reassembles it before the next project enters. The components use their registered positions; reverse scrolling reconstructs the same assembly.

Project names and concise descriptions carry the interface. CAD provenance belongs in development documentation, not repeated as decorative captions. Titles should identify work or explain a real design decision. Technical specifications belong where they help someone understand a project.

The October 3 cleanup applies the Instagram reel's criticism of generic portfolio styling to v2. TramTrace leads the home with a photograph of the working display; Skylabs, Dual USB-C, Coaster and the RF board follow as photographic projects, while Logic Analyser and Tamagotchi use compact board rows. Navigation surfaces are opaque. Hero project links use a flat active underline, and catalogue arrows no longer sit inside decorative circles. The original fonts, dark palette and physical CAD animation remain.

Ordinary headings, prose, project cards and gallery images no longer receive blanket entrance animations. The `v2-motion` imports are removed from both the authored home and the interior generator. Pi copy describes its layout and mechanical dimensions directly; Skylabs no longer repeats its system summary and viewer CTA. Source-rendering commentary is removed from captions and alt text without deleting testing limitations.

### 7 October: hardware folio

The new identity uses Andrew's full name as the opening masthead, heavy uppercase Archivo headings, hard image edges and ruled factual strips. IBM Plex Mono is reserved for real project specifications, dates and small supporting text. The name separates with the assembly's existing scroll position; the project selector's chapter rules show each assembly's progress. Native scrolling, still-image fallbacks and reduced-motion behavior remain intact.

Case-study titles now span the page above the introduction and hardware image. The collection uses a compact three-column catalogue on desktop, two columns on tablets and one on phones. About follows the same typography with a readable professional history. The independent CAD viewers share neutral dark stages, square Assemble/Disassemble controls and compact component readouts. Board geometry, materials, housing and screws are unchanged by the theme work. The accent `#fa7148` against the page background `#141412` has a calculated contrast ratio of 6.61:1.

Reference access was partial. The public caption of [DcWQCQdN28T](https://www.instagram.com/reel/DcWQCQdN28T/) covered tools and workflow. The video in [DcWTIryEqNy](https://www.instagram.com/reel/DcWTIryEqNy/) was observed and showed component-library motion. [DbqYVjazc5Q](https://www.instagram.com/reels/DbqYVjazc5Q/) and [DcEJDHBTyPY](https://www.instagram.com/reels/DcEJDHBTyPY/) were gated by Instagram login. No unseen rules from those two references are attributed to this implementation.

The October 7 static checks pass for all 25 v2 HTML pages, the 15-project inventory, local assets and navigation. Both interior generators reproduce their 23 pages. The v3 mirrors are regenerated only to keep their shared content current; v2 remains the active design.

The theme acceptance suite passes all 23 public routes at 1440 px and 390 px, including mobile navigation and relevant board/tool states. It reports no text-contrast, light-surface or horizontal-overflow findings, no page errors and no failed resources. Fresh Pi desktop/mobile and TramTrace desktop screenshots were also inspected; the Pi housing and both screws remain visible. The motion suite also passes desktop, laptop, tablet, 390 px and 320 px chapters, keyboard selection, idle suspension, live motion-preference changes and context loss. The startup suite passes delayed dependencies, late-script request deduplication, concurrent original-silkscreen loading, pointer/touch interaction, lighting failure recovery and all static preferences. The browser regression passes collection search, navigation and assembly controls. Narrow Pi caption clearance and static posters at 320/390/600 px were refined during visual review; static acceptance was rerun after the sizing fix.

## Interaction

- Native scrolling controls the hero. The page never intercepts wheel/touch input.
- The project selector moves to a project in the sequence; its caption links to the full case study. “View projects” skips the sequence.
- “View projects” targets the gallery heading, clearing the sticky navigation without leaving the hero controls above it.
- Rendering runs only while a pose changes, a viewport resizes, or the scene enters view. Hidden tabs and offscreen scenes stop rendering.
- Physical CAD faces are merged by material within moving components. Dense LED arrays and telemetry passives form small spatial groups, retaining every original geometry and placement. Components separate with stable stagger, different heights, lateral movement and gentle rotation; reversing the motion restores their original positions and orientations.
- The hero uses still images and direct project links for reduced motion and Save Data; JavaScript/WebGL failure retains the same navigation. No loading gate blocks the page.
- Every assembly viewer presents one Disassemble/Assemble action. Dragging rotates the model; pointer hover or a touch tap identifies a physical component in a compact top-right readout. Keyboard rotation and reset remain available without extra toolbar controls.
- Camera preset rows, component directories, selection dropdowns and separation sliders are removed from v2. Skylabs keeps aircraft/ground-station tabs. Coaster's cup simulation is separate from the assembly toolbar, and TramTrace uses one 3D viewer.
- Inspectors load automatically near the viewport, including for reduced motion. Loading does not start animations, enable scroll control or move keyboard focus. A failed load exposes a retry button.
- Skylabs telemetry and ground-station solder masks use the rich blue of the fabricated boards. Copper, silkscreen, components and board cores retain their materials.

## Reference and scope

The [MacBook Pro](https://www.apple.com/macbook-pro/) and [iPad Pro](https://www.apple.com/ipad-pro/) pages were reviewed for object scale, hierarchy, whitespace and the progression from visual introduction to detail. The website’s objects, copy, layout and palette are specific to Andrew’s work.

The Pi card is based on `D:/Electronics Projects/Framework Expansion Card - Raspberry Pi/ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb`. It is an RP2354B microcontroller card, not a Raspberry Pi single-board computer. The legacy SAMD21 reference board in the source folder is not presented as Andrew’s Pi card. The page describes the supplied design; it does not infer fabrication, test results or unfinished status from the available files.

## Source and maintenance

- `assets/v2-assembly-models.js`: exact model loading, material preparation, geometry merging and component groups.
- `assets/v2-assembly.js`: scene lighting, responsive composition and deterministic scroll poses.
- `assets/v2-assembly.css`: fullscreen scene and static fallback.
- `assets/v2.css`, `assets/v2-case.css`: shared gallery theme and interior pages.
- `assets/v2-hardware-models.js`: shared source-CAD loading, materials and reference groups for inspectors and the telemetry hero.
- `assets/v2-hardware.js`, `assets/v2-hardware.css`: shared controls and finite inspector lifecycle.
- `scripts/content/hardware-catalog.json`: factual content, sources, new routes and existing-page assembly integrations.
- `scripts/build-v2-cases.py`: reproducible case/collection/About generation, including the Pi source fragment.
- `scripts/audit-v2.py`: all route, local asset, inventory and document checks.

Original source CAD files are unchanged. Source and rendering details are in `docs/v2-cad.md`, `docs/hardware-catalog.md` and the model assembly metadata.

The cleanup was reviewed in the browser at desktop, 390 px and 320 px widths. Checks covered the featured gallery, mobile navigation, the gallery jump, four Framework search results, all three hero models loading, and Skylabs board switching/disassembly. Static v2/v3 audits and the generated-interior consistency check pass. The existing browser regression's expected lead project is updated to TramTrace; no CAD engine or prepared model assets changed.
