# V3: paper and physical hardware

This alternative lives at `/v3/`; it does not replace the original portfolio or v2. It follows the request for a surreal or conceptual sketch interface, using the actual board as the unfamiliar, oversized object on an otherwise quiet sheet of paper.

## Visual choices

- Warm paper `#e8e5dc`, deep ink `#252923`, restrained rust links, and muted olive rules.
- Upright Georgia display type with the existing self-hosted Archivo and IBM Plex Mono. No new font download for the display face.
- Full-detail telemetry geometry suspended above a real shadow plane. Leaders follow the actual U10 BNO085 and J3 microSD part transforms.
- Alternating editorial project layouts rather than equal cards on the home. Original black-background photography is presented intact within dark image areas.
- All 23 interiors share the new palette and typography. Dark CAD stages keep a local light-text palette; the surrounding page remains paper.
- No generic scroll entrance effects on prose or cards. Physical assembly movement carries the interaction.

## Hero behavior

`assets/v3-hero.js` loads only the telemetry prepared pack, the shared prepared environment, Three.js and the existing component motion helper. It does not simplify geometry or introduce a new animation framework. The immediate WebP poster remains until an actual successful render. A failed dependency, WebGL context or render restores that poster.

Disassemble/Assemble reverses the existing varied component paths. Drag rotates; touch retains vertical page scrolling. Keyboard arrows rotate, Home resets, and bracket keys identify actual components. The SVG leaders and keyboard locator project from the current model transforms.

Animation frames stop when the pose settles, the canvas is outside its viewport margin, or the document is hidden. Reduced motion and Save Data skip automatic model loading and show an explicit Explore in 3D action; reduced-motion poses settle immediately after loading.

## Content and maintenance

`scripts/build-v3-pages.py` generates the public interiors from their current v2 counterparts, preserving viewer data hooks, script ordering, inline tools and JSON. It rewrites page routes and metadata, appends v3 styling, removes the generic v2 entrance animation and cleans redundant viewer-oriented prose. It deliberately skips the internal render route. The Flight Review redirect still targets the shared application.

The unpublished Kiku, uSense, COMP6441 business-card and PCB-notebook projects remain excluded. Existing limitations and project claims are retained; this pass adds no new claims about board population, testing or manufacturing.

## Validation

- Static audit: 24 routes, 23 indexable pages, 23 preserved interiors, local links and fragments, asset/model references, metadata, private-project exclusions and original tool/controller preservation.
- Generator `--check`: all interiors current and repeatable.
- V2 audit: unchanged pages and inventory still pass.
- Browser review: desktop and 390/320 CSS-pixel phone layouts; every indexable v3 route checked at 320 pixels for document overflow. Empty image placeholders in the two nested Skylabs modal shells are intentional.
- Browser interaction: homepage assembly/reassembly; keyboard rotation, Home reset and real component identification; Skylabs telemetry/ground-station switching and explosion; project search; mobile navigation. Hero frames remained unchanged at 169 while idle, then resumed on input and settled back to the assembled pose. No console errors were recorded during this review.

The small physical shadow and framing allowance are computed from the real model bounds. Full CAD detail remains intact; no load-time performance comparison with v2 is claimed by this design pass.
