# V3 physical hardware stage

This iteration uses the original TramTrace, Skylabs and Framework Pi CAD assets in one continuous scene. Project changes move the camera between stationary assemblies. The TramTrace controller view changes the camera, not the placement of physical components. The accepted aircraft-to-telemetry controller and geometry are unchanged.

## Reference-to-implementation map

- [Motion Three.js](https://motion.dev/docs/three) and [Anime timeline positions](https://animejs.com/documentation/timeline/time-position/) informed coordinated object/camera/DOM timing. Implementation is an interruptible native camera interpolation and short Web Animations copy transition. Neither library is installed or claimed to be used at runtime.
- [Kokonut Smooth Tab](https://kokonutui.com/docs/navigation/smooth-tab) informed the persistent, visibly selected project navigation. The controls are native buttons with direct case-study destinations beside the work. The previously rejected card-stack composition is not retained.
- [Motion Primitives Transition Panel](https://github.com/ibelick/motion-primitives/blob/main/components/core/transition-panel.tsx) informed selected-content continuity. Copy, project link and camera target change together, with URL state and reduced-motion handling.
- [Motion Primitives Image Comparison](https://github.com/ibelick/motion-primitives/blob/main/components/core/image-comparison.tsx) informed the controllable reveal. Here the original manufacturing copper SVG is mapped to actual laminate triangles and the mask/silkscreen are clipped at a shared geometric boundary. A native range supplies keyboard and touch input. Surface colours are illustrative; artwork is the original source.
- [Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) informed asymmetric composition and avoiding a generic component-grid landing. Actual rendered desktop/phone studies, rather than the skill alone, determined the final camera and typography.

These references supplied interaction and composition principles, not copied component source. Existing bundled Three.js and other vendor licence notices remain in place. No paid component source was accessed or installed.

## Source boundaries

TramTrace copper uses `assets/models/manufacturing/tramtrace/front-copper.svg` in its original 207.81 × 94.55 mm manufacturing frame. Its large filled regions are genuine copper pours. The overlay reuses the native laminate face, including its board edge and holes. The illustrative LED test recolours the original 116 LED windows according to `tramtrace-board-data.js`; it is labelled as a test pattern, not live transport data.

The Pi model and its caption are RP2354B. Its expanded image is explicitly labelled a CAD assembly; no physical photograph is invented. TramTrace and Skylabs retain their real overview/detail photography, expanded-image keyboard zoom, touch pinch/pan, and load-error recovery.

## Route and preference behavior

- All 15 public projects and all 23 original interior routes remain reachable.
- The collection, About and case pages use the same dark typography and navigation system as the opening.
- Reduced motion keeps a static, directly selectable hardware view and the existing static aircraft fallback. Save Data skips hardware model downloads.
- JavaScript-disabled pages show a real poster and direct project links. WebGL failure keeps project selection, photographs and case links usable.
- Inspection controls do not capture document scrolling. The photo dialog alone uses touch gestures for pinch/pan, and restores focus and page position on close.
- Prototype study pages are not linked from production navigation. Root, v1 and v2 are not changed.
