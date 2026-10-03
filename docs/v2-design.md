# V2 — hardware, inside and out

Revised 3 October 2026. The portfolio lives at `/v2/` and contains 15 projects, including the expanded electronics collection and Coaster. The standalone browser tools are not presented as portfolio projects.

## Visual direction

The theme is the physical assembly. Board outlines, copper, chips and connectors provide the shapes and colour; the surrounding page uses deep charcoal, soft white text and pale blue links. Dark image surfaces suit the original black-background photographs. There are no decorative circuit traces, fabricated component labels or artificial engineering readouts. Separation between sections leaves enough space to see how the parts relate.

The opening is a full-screen, scroll-controlled scene led by TramTrace, followed by Skylabs telemetry and the Raspberry Pi card. It starts with all three boards, moves one into focus, separates its actual components, then reassembles it before the next project enters. The components use their registered positions; reverse scrolling reconstructs the same assembly.

Project names and concise descriptions carry the interface. CAD provenance belongs in development documentation, not repeated as decorative captions. Titles should identify work or explain a real design decision. Technical specifications belong where they help someone understand a project.

## Interaction

- Native scrolling controls the hero. The page never intercepts wheel/touch input.
- The project selector moves to a project in the sequence; its caption links to the full case study. “View projects” skips the sequence.
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
