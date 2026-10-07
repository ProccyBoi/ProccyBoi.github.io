# Andrew Chung — v2 design contract

Revised 7 October 2026. This records the visual system and the reference-to-implementation decisions for v2. The portfolio remains a static site with native browser interactions and its existing Three.js CAD pipeline.

The separate [v3 aircraft study](docs/v3-aircraft-design.md) follows the Skylabs trainer from landing to the telemetry board beneath its wing. Its [aircraft reference ledger](docs/v3-aircraft-references.md) separates supplied CAD, observed photographs and reconstructed details. The earlier [manufacturing study](docs/v3-manufacturing-design.md) remains documented. The expanded [reference review](docs/reference-capabilities-20261007.md) records the public feature coverage, detailed source review and access limits for the requested design tools.

## Audience and purpose

An engineering recruiter should understand Andrew's work quickly; an engineer should be able to inspect the hardware and follow a design decision. The opening establishes the person and three real projects. The gallery offers direct entry. Case studies provide evidence, technical details and interactive assemblies without making visitors complete an animation first.

The identity comes from the physical work: solder mask, traces, machined edges, translucent housings and populated boards. The interface should be quiet enough to make those differences visible. The hero uses shaped studio reflections, surface-specific roughness and restrained clearcoat with real self-shadows; source CAD, colours and textures remain authoritative. Do not add decorative circuits, invented instrumentation, slogans, status badges or claims unsupported by the project sources.

## Evidence and visual material

- Use existing project photographs, registered CAD geometry and original silkscreen. TramTrace's working display, Skylabs telemetry macros and Dual USB-C installed in a laptop provide different kinds of evidence; do not frame them as interchangeable illustrations.
- The hero features TramTrace, Skylabs telemetry and the Raspberry Pi expansion card. Preserve source component placement, materials, housings and screws. The Pi card is an RP2354B microcontroller design, not a Raspberry Pi single-board computer.
- Keep private or unready projects out of the public inventory. Do not infer manufacturing, testing or performance from a rendered model.
- The generated hero and gallery studies are composition references only. Their illustrative hardware is not a source of component geometry, photographs or specifications. Production imagery must come from Andrew's supplied work.
- Factual sources remain in `scripts/content/hardware-catalog.json`, the existing case-study content and the model metadata. Development provenance belongs in repository documentation, not repeated visitor-facing captions.

## Typography, colour and geometry

| Role | Contract |
| --- | --- |
| Palette | Warm charcoal `#141412`, chalk `#ecebe3`, muted `#aaa99f`, rule `#393a34`, restrained vermilion `#fa7148`. The boards supply additional colour. |
| Display | Archivo, natural case, weight about 500. Only the homepage name takes masthead scale, capped around 132 px. Case titles span 32–80 px. |
| Section and project headings | Archivo 500–550, modest negative tracking, readable line height. They identify content without competing with the hardware. |
| Prose | Normal sans serif, approximately 16–18 px with comfortable line spacing and a bounded reading width. |
| Facts | IBM Plex Mono for actual dates, specifications and component identity, normally 13–16 px. Do not shrink useful engineering information into decoration. |
| Surfaces | Hard photographic edges, neutral dark CAD stages, sparse one-pixel rules. No extra nested panels, blue glow or decorative rounded badges. |

Keep the existing navigation, case-study sections, collection and About structure. Reduce oversized heading blocks and repetitive empty space. The gallery's main photograph takes roughly two thirds of its desktop composition, with project selection in the remaining third. On phones, the photo stays below the navigation while the project rows scroll beneath it, then returns to normal flow before the smaller projects. Short viewports use ordinary flow. Preserve each image's meaningful subject; cropping must be judged against the actual board, not imposed uniformly across unrelated shapes.

The interior layer in `assets/v2-case.css` implements the quieter hierarchy, larger facts and component identity, and consistent viewer controls in place. Existing declarations are revised rather than accumulating another theme override layer.

## Interaction and motion

- **Opening assembly:** one coherent sequence: introduce the three objects, focus a project, separate meaningful groups, restore the assembly, hand off to the next. Component variation should communicate construction. Use stable, reversible choreography; no random drift. Keep the existing staggered component paths and real geometry.
- **Photographic gallery:** keep one flat, registered photograph and the clear selection of expandable rows. Overview and detail crossfade in the same frame, with no overlapping miniature sheets. Selection changes the main real photograph and its related project description together. The active row, thumbnail and image describe one state. Avoid hover-only access, automatic cycling and extra decorative captions.
- **Continuity:** let an active navigation marker and the selected photograph move between known positions. Immediate semantic state must not wait for a visual transition. Prefer native transforms/opacity and small, interruptible transitions; no component library installation is required.
- **Component inspection:** keep the single Assemble/Disassemble action and top-right component identity. The photograph helper connects Dual USB-C U3, Skylabs telemetry U11 and TramTrace U3 to their actual project macros. It must add evidence, not another permanent toolbar or invented component photo.
- **Reading:** ordinary prose, headings and images remain present without entrance choreography. Keep native scrolling and direct project links. Motion serves object inspection and selection rather than being spread across every element.

## References and the decisions they inform

These are independent source materials studied during this pass, not endorsements of this website. A demonstrated interaction is a design reference, not a requirement to adopt its framework.

| Source | Application and boundary |
| --- | --- |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill), including its [design](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) and [redesign](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md) texts | Audit audience, content and signature interactions before styling. Give imagery priority and make hierarchy intentional. Do not adopt its suggested invented metrics or assume React/Tailwind is appropriate here. The repository now defaults to an experimental v2; the reel's exact historical version is unconfirmed. |
| [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) and the [underlying checklist](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) | Visible focus, semantic controls, keyboard support, motion alternatives, explicit image dimensions and efficient rendering. Avoid `transition: all`, even where another reference suggests it. |
| [Awesome DESIGN.md](https://github.com/VoltAgent/awesome-design-md) — [Apple](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md), [IBM](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/ibm/DESIGN.md), [SpaceX](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/spacex/DESIGN.md) | Document relationships and the reason for visual choices, not just tokens. Use object scale, quiet framing and readable facts. These are third-party brand analyses, not official brand guidelines. |
| [Image to Code](https://github.com/Leonxlnx/taste-skill/blob/main/skills/image-to-code-skill/SKILL.md) | Study large, section-specific visual references before implementation, then compare typography, image balance and spacing. Use generated studies to resolve composition; retain factual photographs and CAD in production. This paired resource is the strongest match to the named Taste workflow, not proof of a reel transcript. |
| [Kokonut Card Stack](https://kokonutui.com/docs/cards/card-stack) | The current gallery retains a clear selected image, with flat overview/detail transitions. Overlapping photo stacks are excluded; the board photography should remain unobstructed. |
| [Watermelon Card Split Accordion](https://ui.watermelon.sh/animated-components/card-split-accordian) | Expandable project rows make one selection prominent while keeping the other projects directly available. Preserve ordinary links and keyboard operation. |
| Motion Primitives [transition panel](https://github.com/ibelick/motion-primitives/blob/main/components/core/transition-panel.tsx) and [image comparison](https://github.com/ibelick/motion-primitives/blob/main/components/core/image-comparison.tsx) | Maintain continuity while changing image and text. A comparison requires a genuine visual relationship; unrelated CAD and photo viewpoints must not imply geometric registration. |
| [Bklit tooltip](https://bklit.com/docs/utility/tooltip) | A compact contextual probe informs the component photograph helper. It complements the existing accessible component readout; it does not justify more controls. |
| [Anime.js](https://animejs.com/), [timeline positions](https://animejs.com/documentation/timeline/time-position/) and [Scope media queries](https://animejs.com/documentation/scope/scope-parameters/mediaqueries) | Treat overlap, hold and stagger as authored choreography, with viewport-specific composition. Keep the current deterministic scroll pipeline rather than adding a second animation clock. |
| [Motion performance](https://motion.dev/docs/performance) and [scroll](https://motion.dev/docs/scroll) | Prefer compositor-friendly properties, batch measurement and writes, and suspend idle work. Do not sacrifice model fidelity to hide poor loading behavior. |
| Manus [editing and previewing](https://manus.im/docs/website-builder/editing-and-previewing), [Figma import](https://manus.im/docs/website-builder/import-figma), and [making a copy](https://manus.im/docs/website-builder/make-a-copy) | Use a concrete reference, inspect a rendered preview and preserve a reviewable version. These inform the workflow; this website remains in its existing repository and hosting setup. |
| [Haikei generators](https://haikei.app/generators/) | A likely interpretation of the ambiguous name “Haikey”, not a confirmed match. No generated blob, wave or decorative background is needed for this hardware-led direction. |

Source review date: 7 October 2026. The Instagram sources have partial access only: the first public caption and second video were observed; the final two references were login-gated. No unseen reel instructions are attributed to this contract.

## Performance and accessibility acceptance

The first frame must show useful content before WebGL is ready. Preserve the prepared model assets, immediate still-image fallback, parallel dependency loading and original source geometry. Prioritise the real opening asset; gallery image URLs become active only as their photographs approach the viewport, so browser lazy-load lookahead cannot compete with the hero. Native no-JS photographs remain available, and a viewport-gated fallback preserves the static gallery if its controller fails to load. Reserve image dimensions, avoid a blocking loader and pause rendering when the scene is idle, offscreen or the tab is hidden.

All project selection must work with pointer, touch and keyboard. Preserve visible focus, meaningful accessible names, existing routes and static content. Aim for 44 px control targets. Reduced motion, Save Data and graphics failure must retain photographs, project navigation and readable case studies; no user has to watch the sequence to reach the work.

Before publishing, verify the current rendered pages at desktop and narrow widths, image selection, keyboard state, component identity, every Framework housing and screw, motion preferences, and resource failures. Run the existing route, generation, browser, motion and startup checks appropriate to the changed code. Record actual results separately; this contract does not declare them passed in advance.
