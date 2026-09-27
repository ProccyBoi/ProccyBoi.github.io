# V2 — hardware, inside and out

Revised 27 September 2026. The portfolio lives at `/v2/` and contains 18 projects, including the expanded electronics collection and Coaster.

## Visual direction

The theme is the physical assembly. Board outlines, copper, chips and connectors provide the shapes and colour; the surrounding page uses near-white surfaces, graphite text and blue links. There are no decorative circuit traces, fabricated component labels or artificial engineering readouts. Separation between sections follows the same principle as separation between parts: enough space to see their relationship.

The opening is a full-screen, scroll-controlled scene featuring the ESP32 card, Raspberry Pi card and TramTrace. It starts with all three boards, moves one into focus, separates its actual components, then reassembles it before the next project enters. The components use their real positions; reverse scrolling reconstructs the same assembly.

Project names and concise descriptions carry the interface. CAD provenance belongs in development documentation, not repeated as decorative captions. Titles should identify work or explain a real design decision. Technical specifications belong where they help someone understand a project.

## Interaction

- Native scrolling controls the hero. The page never intercepts wheel/touch input.
- The project selector moves to a project in the sequence; its caption links to the full case study. “View projects” skips the sequence.
- Rendering runs only while a pose changes, a viewport resizes, or the scene enters view. Hidden tabs and offscreen scenes stop rendering.
- Physical CAD faces are merged by material within moving components. TramTrace’s LEDs form one bank for the hero, retaining all 116 source geometries.
- Reduced motion and Save Data start with still images and direct project links; JavaScript/WebGL failure retains the same navigation. No loading gate blocks the page.
- The standalone Raspberry Pi inspector adds orbiting, camera presets, component identification, shell visibility and assembly separation.
- The shared hardware inspector adds on-demand component selection, front/back views, assembly separation and optional scroll control across the electronics collection.

## Reference and scope

The [MacBook Pro](https://www.apple.com/macbook-pro/) and [iPad Pro](https://www.apple.com/ipad-pro/) pages were reviewed for object scale, hierarchy, whitespace and the progression from visual introduction to detail. The website’s objects, copy, layout and palette are specific to Andrew’s work.

The Pi card is based on `D:/Electronics Projects/Framework Expansion Card - Raspberry Pi/ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb`. It is an RP2354B microcontroller card, not a Raspberry Pi single-board computer. The legacy SAMD21 reference board in the source folder is not presented as Andrew’s Pi card. The page describes the supplied design; it does not infer fabrication, test results or unfinished status from the available files.

## Source and maintenance

- `assets/v2-assembly-models.js`: exact model loading, material preparation, geometry merging and component groups.
- `assets/v2-assembly.js`: scene lighting, responsive composition and deterministic scroll poses.
- `assets/v2-assembly.css`: fullscreen scene and static fallback.
- `assets/v2.css`, `assets/v2-case.css`: shared gallery theme and interior pages.
- `assets/v2-hardware.js`, `assets/v2-hardware.css`: shared model factory and finite inspector lifecycle.
- `scripts/content/hardware-catalog.json`: factual content, sources, new routes and existing-page assembly integrations.
- `scripts/build-v2-cases.py`: reproducible case/collection/About generation, including the Pi source fragment.
- `scripts/audit-v2.py`: all route, local asset, inventory and document checks.

Original source CAD files are unchanged. Source and rendering details are in `docs/v2-cad.md`, `docs/hardware-catalog.md` and the model assembly metadata.
