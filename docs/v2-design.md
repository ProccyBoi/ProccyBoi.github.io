# V2 — signal and matter

This is the new portfolio at `/v2/`. The original site remains available at its existing URLs. The scope is the same fourteen public projects; Skylabs' two board details and existing software tools remain part of that work.

## Direction

The identity combines a graphite studio, copper-coloured emphasis and pale mineral surfaces. Large hardware imagery establishes the physical work; a restrained monospaced notation gives specifications a distinct voice. Archivo stays self-hosted, with a quieter weight and more deliberate scale than the original site.

The homepage answers three questions in sequence: what Andrew does, what he has built, and how he thinks across a system. The interactive signal explorer supplies concrete engineering detail, while the case studies hold the full evidence, photographs and existing hardware inspectors. Navigation has three stable destinations: work, about and contact.

## References reviewed for this version

Reviewed 21 September 2026. These are design references, not sources of project claims or assets.

- [Apple MacBook Pro](https://www.apple.com/macbook-pro/): object-led opening, generous product scale, then progressively deeper technical sections. Applied to the true CAD hero and the overview-to-inspection case-study flow.
- [Apple iPhone Air](https://www.apple.com/iphone-air/): disciplined product framing, short headings and space around the subject. Applied to the restrained hero composition and specification hierarchy.
- [Teenage Engineering OP–1 field](https://teenage.engineering/products/op-1): physical details and technical characteristics presented as part of an object's identity. Applied to the numbered objects, material palette and concrete component information.
- [Linear features](https://linear.app/features): distinct product sections and a clear scanning hierarchy. Applied to the portfolio's separation between overview, working system and detailed project evidence.

## Image provenance

The new Framework and TramTrace studio images are rendered from the repository's existing KiCad-exported GLB geometry. The Framework connector uses the existing connector CAD asset. Existing Skylabs turntable imagery supplies the aircraft-board rendering. These are source-derived renders, not photographs or fabricated PCB artwork. Photograph galleries remain the evidence of assembled hardware. The original source geometry is not changed.

The optional homepage 3D inspector loads its graphics engine and CAD only on request. Its poster is the default for immediate rendering, JavaScript-disabled browsing and WebGL failure. View buttons provide alternatives to dragging. Rendering should stop when idle and hidden.

## Second-pass motion

Motion now follows the physical work. The TramTrace story separates its actual back copper, front copper, solder mask and silkscreen into a dimensional stack, aligns them into the source-rendered assembly, and transitions to the photographed live display. Desktop scroll position drives the sequence; three labelled buttons and arrow keys provide direct access. The presentation distinguishes schematic layer separation from the real build.

Headlines reveal in a short staggered sequence, the CAD poster settles into its studio frame, sections enter as they become visible, and system diagrams respond to a new selection. These are finite motions; there is no idle animation loop. CAD preset moves ease over 720 ms and take the shortest orbit, with direct input immediately taking over. Reduced-motion preferences apply both at startup and when changed during the session. Mobile uses an unpinned board story; the static document retains every engineering chapter and the actual build photograph when JavaScript is unavailable.

## Content rules

- Keep the existing fourteen top-level projects; no unfinished projects are added.
- Preserve hardware/software facts from existing published material.
- Skylabs: 40 Hz onboard log, live telemetry subset up to 10 Hz.
- Framework dual card: USB 2.0, not an implied higher-speed or charging specification.
- RF coupon: 50 Ω is the design target, not a claimed measurement.
- Dash's existing photographs show the earlier vehicle prototype, not the present cube.
- No invented client, performance, manufacturing, product-availability or career claims.

## Interaction and delivery

Static HTML is the primary interface. Project pages have direct URLs, real links, metadata and readable content without JavaScript. Enhancement adds explicit CAD inspection, system detail selection, project search/filter and mobile navigation. The theme respects reduced motion and uses no scroll hijacking, startup gate, autoplay video or continuous background rendering.

Case pages are reproduced by `scripts/build-v2-cases.py` from the existing factual pages. `scripts/audit-v2.py` checks the generated site's route and document structure. Browser checks must also cover layout, hardware controls, system selection, filtering, keyboard access, no-JavaScript content and small screens; static checks cannot establish those properties.
