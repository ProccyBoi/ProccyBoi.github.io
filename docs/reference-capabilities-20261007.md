# Reference capabilities and design decisions

Reviewed 7 October 2026 for the proposed v3 manufacturing journey, the v2 hero's material realism, and a simpler photographic gallery.

This is a research ledger, not a claim that every example has been installed or tested. **Catalog coverage** means the public feature index was examined. **Detailed coverage** means the linked documentation or component source was read. The earlier pass also visually inspected the Kokonut Card Stack and Watermelon Card Split Accordion demos. No paid components, private account tools, or external code were installed during this review. Recommendations below are this project's decisions; the source authors do not endorse this website.

## Decisions for this portfolio

| Need | Recommended implementation | Reference contribution |
| --- | --- | --- |
| V3: fabrication → placement → final product | Keep TramTrace registered in a stable stage. Reveal its documented board construction, seat components in their correct positions, then hand off to the actual working-project photograph. TramTrace has no CAD housing or fastener closure to invent. Use three named chapters with direct links and reversible scroll progress. | Anime timeline positions and scroll synchronization; Motion sequences and scroll values. |
| A manufacturing story that is credible | Use actual board artwork, supplied CAD and project photographs. Distinguish an explanatory assembly animation from footage or evidence of the actual factory process. Do not invent copper layers, machines, paste deposition, tolerances or test results. | Taste's brief/content audit; Image to Code's visual planning process, constrained by the project's evidence. |
| More realistic v2 hero | Preserve the source meshes, populated boards, Pi button placement, housings and screws. Refine material differences, reflected light, contact depth and shadow composition in the existing renderer. | Motion's Three.js integration documents coordination of transforms/material properties, but neither it nor a UI library creates physically accurate materials or geometry automatically. |
| Less messy photographs | One flat main photograph, fixed frame, clear project selection, and a small overview/detail choice where useful. Keep aspect and crop appropriate to the object. | Transition Panel, tabs and selected-state continuity; reject the overlapping-stack appearance that the user disliked. |
| Navigation without more viewer controls | Visible chapter links; one Assemble/Disassemble action for standalone viewers; component identity available on hover and focus/tap alternatives. | Vercel semantics; small contextual disclosure patterns. |
| Fast, accessible motion | Useful static content first, one animation clock for each scene, viewport-gated secondary media, idle rendering suspended. Reduced motion provides the same chapters and finished-object evidence without long travel. | Motion performance guide, Anime responsive Scope, Vercel checklist. |

The visual distinction should come from seeing how Andrew's real hardware is made. It does not require a new framework, a library-shaped page, generic abstract backgrounds, or more controls.

## 1. Taste Skill

**Identity and coverage.** The strongest match is [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill), which publishes both Taste and Image to Code. The README's full skill inventory was examined: experimental Taste v2, retained v1, GPT Taste, Image to Code, Redesign, Soft, Output, Minimalist, Brutalist, Stitch, web/mobile Imagegen, and Brandkit. This does not prove which historical version appeared in a reel, and the bodies of every variant were not examined.

The actual [v2 design skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md), [v1](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill-v1/SKILL.md), and [Redesign skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/redesign-skill/SKILL.md) were read. They cover brief inference, hierarchy, density, material treatment, responsive layout, interaction states, signature motion, preservation rules, and preflight review.

**Use here.** Establish the physical construction as the signature interaction; let imagery lead; preserve useful existing routes and engineering content. Review the result as a whole rather than adjusting only type and colour.

**Limits.** These are opinionated instructions, not a design authority. Do not follow the Redesign text's suggestion to invent realistic metrics or dates. Its stack preferences do not justify a React migration. Where v1 suggests `transition: all`, follow the more precise Vercel performance guidance instead. No global installation was performed.

## 2. Vercel Web Design Guidelines

The [agent skill](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) points to the actual [Web Interface Guidelines checklist](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md); both were read, including all checklist categories.

It covers semantics, focus, forms, animation, typography, content resilience, images, performance, navigation state, touch, safe areas, dark mode, localization, hydration, interaction feedback and copy. For this site, the valuable checks are named native controls, visible focus, keyboard alternatives to gestures, reduced motion, interruptible transitions, fixed image dimensions, priority for critical media, batched layout work, and deep links for meaningful state.

**Use here.** Chapter navigation should remain ordinary links. A custom slider must expose a keyboard-operable range; phase changes must not wait for animation before updating accessible state. Sticky stages must not obscure focused controls. Use explicit transition properties and native page scrolling.

**Limits.** Apply product-specific advice in context. A personal portfolio can use first-person prose despite the checklist's general copy preference. The checklist is not proof that any imported component is accessible, and “transform only” for DOM transitions is not a prohibition on moving real Three.js geometry.

## 3. Awesome DESIGN.md

The [public repository catalog](https://github.com/VoltAgent/awesome-design-md) was examined; it advertised 73 analyses at review time. The actual [Apple](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md), [IBM](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/ibm/DESIGN.md), and [SpaceX](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/spacex/DESIGN.md) texts were read. The remaining brand files were catalogued, not all individually studied.

These documents describe visual systems through typography, colour, spacing, imagery, components and motion. They are third-party brand analyses, not official guidelines from those companies.

**Use here.** Record why each role exists: quiet interface, large real objects, compact factual information, and a consistent relationship between chapter text and hardware. A DESIGN.md should make subsequent decisions coherent, not merely list hex codes. Apple's object emphasis and IBM's information hierarchy are useful lenses without copying either brand's page.

**Limits.** Do not treat a brand-inspired file as an installable theme, factual authority, or endorsement. This site's original content and physical assets determine its identity.

## 4. Image to Code

The complete [Image to Code skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/image-to-code-skill/SKILL.md) was read. It specifies image-first planning, section-specific references, independent visual analysis, fixed media frames, responsive composition, typography/spacing extraction, avoidance of nested panels, and comparison of implementation against the study. Its pairing with Taste makes this the strongest identified match to the named workflow, not a verified reel transcript.

**Use here.** Resolve the manufacturing stage and finished-product composition before styling many sections. Judge object size, camera position, negative space, text balance and mobile framing together. Separate compositional studies from production assets.

**Limits.** A generated circuit board is not the user's circuit board. Generated images must not become component geometry, silkscreen, manufacturing evidence or specifications. The skill's large prescribed image batches are not a reason to produce redundant artwork when supplied photographs and CAD already answer the visual question. No image-generation service was installed as part of this research.

## 5. Anime.js

The full [documentation index](https://animejs.com/documentation/) was examined: Timer, Animation, Timeline, Animatable, Draggable, Layout, Scope, Events, SVG, Text, utilities, easings, WAAPI, engine and adapters. Relevant overview pages and the detailed pages below were read; this was not an execution test of every API.

- [Timeline positions](https://animejs.com/documentation/timeline/time-position/) support explicit positions, labels, overlap, relative offsets and stagger. These are useful for separating arrival, seating, hold and housing closure into authored beats.
- [ScrollObserver](https://animejs.com/documentation/events/onscroll/) and its [synchronization modes](https://animejs.com/documentation/events/onscroll/scrollobserver-synchronisation-modes) connect scroll with timers, animations and timelines. A manufacturing sequence needs deterministic seeking in either direction.
- [SVG tools](https://animejs.com/documentation/svg/) provide drawing, morphing and motion paths. Use only real board artwork where it explains a stage; a drawn trace is an illustration, not a literal fabrication process.
- [Scope media queries](https://animejs.com/documentation/scope/scope-parameters/mediaqueries) support different viewport and reduced-motion behaviour. [Layout](https://animejs.com/documentation/layout) and [WAAPI](https://animejs.com/documentation/web-animation-api) are additional capabilities, not requirements for this scene.

**Decision.** Borrow the timeline discipline. The existing renderer can implement these relationships without adding a competing animation engine. Dragging, text splitting and decorative SVG morphs are lower priorities than legible construction and accurate component positions.

## 6. Motion.dev

The [official complete documentation index](https://motion.dev/llms.txt), [overview](https://motion.dev/docs), and relevant guides were read. Catalog coverage includes JavaScript, React and Vue; sequences, gestures, layout/presence, scroll, motion values, SVG, Three.js/vgpu integrations, and the Studio/AI tooling offerings. Individual framework hooks and every example were not tested.

The [Three.js guide](https://motion.dev/docs/three) documents coordinated Object3D transforms, material properties, vectors, shader uniforms and TSL uniforms alongside DOM/SVG sequences. That is useful for consistent stage timing. It is an animation adapter, not a renderer or a realism preset.

The [performance guide](https://motion.dev/docs/performance) distinguishes layout, paint, composite and main-thread animation cost. It recommends transform/opacity as the safest DOM properties, cautions about GPU-layer cost, and requires measurement outside those cases. The [scroll guide](https://motion.dev/docs/scroll) supports scroll-linked progress and offsets. These principles can be retained in native code.

**Access boundary.** The index identifies the core JavaScript/React/Vue packages as free MIT libraries. Motion+ includes paid APIs/components and premium examples: the catalog marks features such as JavaScript layout animation, curtains and text utilities, plus framework carousels/cursors/tickers. AI Kit and Studio offerings also have distinct access levels. No paid source, account tooling or private examples were accessed, and none are needed for the proposed stage.

## 7. Kokonut UI

The [docs](https://kokonutui.com/docs), [public index](https://kokonutui.com/llms.txt), and complete [registry metadata](https://kokonutui.com/r/registry.json) were examined. The registry exposed **51 entries: 46 components, four hooks and one utility**. This is a registry count, not a claim about every marketing variant. Families include cards/carousels, navigation/tabs/drawers, backgrounds, inputs/uploads, AI interfaces, animated text and buttons.

The earlier [Card Stack](https://kokonutui.com/docs/cards/card-stack) demo was visually examined. This pass read [Smooth Tab](https://kokonutui.com/docs/navigation/smooth-tab), [Smooth Drawer](https://kokonutui.com/docs/navigation/smooth-drawer), and the actual [Smooth Tab source](https://kokonutui.com/r/smooth-tab.json).

**Use here.** A visibly selected phase and a bounded content transition are useful. Card stacks, liquid glass, looping waves, magnetic buttons and shimmer text would distract from manufacturing. The user's rejection of messy stacks overrides the earlier stack study.

**Source caution.** The examined Smooth Tab source makes inactive tabs unfocusable but handles only Enter/Space, not arrow navigation; its panel relationship also needs semantic completion. Do not copy it uncritically. Native chapter links are simpler here.

**Access boundary.** The open-source collection is separate from [Kokonut UI Pro](https://kokonutui.pro/), which sells components and seven-plus templates. Only the public Pro catalog was read; its paid source was not accessed. No React/Tailwind dependency was installed.

## 8. Watermelon UI

The [public index](https://ui.watermelon.sh/llms.txt), [catalog summary](https://ui.watermelon.sh/api/catalog/summary), [API definition](https://ui.watermelon.sh/openapi.json), and [sitemap](https://ui.watermelon.sh/sitemap.xml) were examined. The summary reported **849 entries: 516 base components, 131 animated components, 189 blocks, 12 dashboards and one template**. All animated route names and the base/block category lists were reviewed; source was not read for all 849 entries.

The catalog spans common controls, navigation, charts/forms, commercial page sections, animated cards, tabs, carousels, sliders, steppers and disclosure. Relevant candidates beyond the earlier [Card Split Accordion](https://ui.watermelon.sh/animated-components/card-split-accordian) include continuous/discrete/fluid tabs, scrub sliders, phase steppers and carousel navigators.

The actual [Step Indicator](https://registry.watermelon.sh/r/step-indicator.json) and [Minimal Carousel](https://registry.watermelon.sh/r/minimal-carousel.json) source were read. Step Indicator's tiny unnamed buttons and hover/focus labels need accessible names and larger hit areas. Minimal Carousel uses clickable non-button cards and a wallet-style layout; it is not a ready-made accessible project gallery.

**Decision.** Use the principle of one clear selection, not the styling or source wholesale. Native labelled phase links and one photograph are sufficient. Public catalog/registry access required no account; no installation occurred. Finance, AI, pricing and dashboard templates do not add useful evidence to this portfolio.

## 9. Motion Primitives

The public docs site returned HTTP 403 in this research tool. The [official repository](https://github.com/ibelick/motion-primitives), README and complete [33-file core directory](https://api.github.com/repos/ibelick/motion-primitives/contents/components/core) were accessible. The core covers disclosure/dialogs, selected backgrounds, carousels, toolbars, scroll/in-view, image comparison, typography effects, cursors, tilt, glow and other effects. The public core is MIT; no unavailable website or private features were claimed as tested.

Four actual sources were read:

- [Transition Panel](https://github.com/ibelick/motion-primitives/blob/main/components/core/transition-panel.tsx): keyed enter/exit continuity between known states. Useful for a flat project photo stage; surrounding semantics remain the consumer's responsibility.
- [Image Comparison](https://github.com/ibelick/motion-primitives/blob/main/components/core/image-comparison.tsx): pointer/touch comparison using clipping. It lacks a keyboard range control. Reimplement with a native input if needed, and only compare genuinely registered views.
- [Scroll Progress](https://github.com/ibelick/motion-primitives/blob/main/components/core/scroll-progress.tsx): progress mapped to a transform. Useful for a small chapter indicator; avoid excessive spring lag.
- [Disclosure](https://github.com/ibelick/motion-primitives/blob/main/components/core/disclosure.tsx): animated reveal with controlled state and keyboard handling. Trigger/content relationships still require careful integration.

**Decision.** Reuse continuity principles in existing native code. Tilt, magnetic cursors, infinite sliders and text scrambling would compete with the board itself.

## 10. Bklit UI

The [public docs catalog](https://bklit.com/docs), [blocks](https://bklit.com/blocks), [Studio page](https://bklit.com/studio), [repository README](https://github.com/bklit/bklit-ui), and detailed [Tooltip docs](https://bklit.com/docs/utility/tooltip) were read. The current product is focused on charts: area/bar/line/live-line, candlestick, maps, composed/funnel/gauge/heatmap, pie/radar/ring/scatter, Sankey and sunburst; utilities include legends, axes, brushes, reference regions and tooltips.

**Use here.** Real telemetry or measured test data could justify a chart with a probe, labels and units in a future case study. There is no reason to invent animated engineering readouts for the hero. The earlier tooltip reference contributes only the compact contextual-information idea: `ChartTooltip` itself explicitly requires a chart context and is not a general 3D component inspector.

**Access boundary.** The repository distinguishes MIT chart components from proprietary Studio. Its README documents live chart styling/animation controls and generated React/registry exports; this review did not operate an editor session or export a chart. Do not treat all publicly visible Studio code as reusable open source.

## 11. Manus

The [official documentation index](https://manus.im/docs/llms.txt) was examined across website building, design, research, documents, automation, integrations and agents. Detailed coverage focused on [editing/previewing](https://manus.im/docs/website-builder/editing-and-previewing), [code control](https://manus.im/docs/website-builder/code-control), [Figma import](https://manus.im/docs/website-builder/import-figma), [making a copy](https://manus.im/docs/website-builder/make-a-copy), [GitHub integration](https://manus.im/docs/website-builder/github-integration), [usage/pricing](https://manus.im/docs/website-builder/getting-started/usage-and-pricing), and [Design View](https://manus.im/docs/features/design-view).

Relevant documented capabilities include direct visual edits, batched prompt edits, device/path previews, editable code export, Figma interpretation, isolated copies and design-image generation. The wider builder also documents publishing, infrastructure, domains, analytics, payments and integrations; these are not requirements for this static portfolio.

**Decision.** Retain the useful workflow: concrete composition, inspectable preview, controlled iteration and a reviewable version. The current GitHub integration documentation describes creating a new private repository with two-way sync, not importing this existing unrelated repository through that flow. There is no benefit in migrating the site for this task.

**Access boundary.** Building/editing credits and runtime/hosting usage are separate documented charges with allowances. No account-only builder, Figma import, generated app, payment or deployment was exercised. Design-image output is a study, not evidence of Andrew's hardware.

## 12. Haikei, probably the ambiguous “Haikey”

The identity remains unconfirmed. [Haikei's generator catalog](https://haikei.app/generators/) is a plausible match and was read in full: Blob, Wave, Blurry Gradient, Circle Scatter, Blob Scene, layered/stacked Waves, Blob Scatter, Low Poly Grid, layered/stacked Peaks, Polygon Scatter, layered/stacked Steps, and Symbol Scatter.

The [pricing page](https://haikei.app/pricing/) lists 15 basic generators, SVG/PNG export and canvas presets. It still labels Pro as forthcoming with price undetermined; its higher-resolution exports and additional controls must not be described as verified available features. No authenticated app operation was tested.

**Decision.** None of these generators supplies PCB manufacturing truth. Blobs, waves and decorative layer shapes are poor substitutes for real copper, board outlines and components. Use actual design files for the v3 construction sequence. A generic generated background would make the site less specific to this work.

## Acceptance before presenting the redesign

These are implementation criteria, not claims that the work has already passed them:

1. **Factual geometry:** compare the closed assembly with supplied CAD/photographs; retain housing, screws and correct populated-component orientations. Keep excluded/private projects excluded.
2. **Readable construction:** test the three chapters at their endpoints and between them. Scrolling backwards or jumping to a chapter must produce the same registered object state. Explain only manufacturing details supported by the project sources.
3. **Straightforward access:** direct project/chapter links, ordinary scrolling, visible focus, named controls, touch alternatives, and useful no-JavaScript/WebGL-failure content. Reduced motion should preserve information rather than merely shorten a long scroll.
4. **Controlled photography:** one primary photo at a time, no pile of decorative sheets, no cropped-off essential connectors or board edges, and no delayed image response replacing a newer selection.
5. **Comparable performance:** measure cold startup with the same viewport, network/CPU conditions and cache state. Report first visible CAD, lead model readiness, critical transfer bytes and early gallery requests separately; do not label a warm cached run as a cold-load improvement.
6. **Independent visual review:** inspect desktop and phone compositions, model materials, shadow contact and chapter handoffs. Automated geometry and accessibility checks do not establish that a scene looks convincing.

The resource review supports a focused manufacturing narrative and quieter surrounding UI. It does not support adding every appealing demo or claiming that studying a catalog is equivalent to testing its entire product.
