# Portfolio V3 design rationale

This register records the decisions behind the August 2026 PCB and navigation refresh. It is intentionally limited to changes that shipped; it is not a wishlist. Each decision is supported by at least three independent sources.

## 1. Keep one predictable top-level vocabulary

**Decision:** use `Projects`, `About`, `Labs`, `Files` and `Contact` consistently. The Projects page now surfaces the two existing PCB inspectors at the start of Labs, so the global Labs link reaches the work visitors expect.

**Why:** visitors should not have to translate between “Experience” and “About”, or infer that PCB inspectors are hidden inside a generic interactive section.

Sources:

- [W3C — Consistent Navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html)
- [Nielsen Norman Group — Menu Design Checklist](https://media.nngroup.com/media/articles/attachments/PDF_Menu-Design-Checklist.pdf)
- [GOV.UK Design System — Navigate a service](https://design-system.service.gov.uk/patterns/navigate-a-service/)

## 2. Make accurate PCB rotation optional and keep inspection as the default

**Decision:** add a click-to-load, 24-angle TramTrace turntable beside the existing assembled, copper and data views. The static inspection view remains the default. The turntable is rendered from the production board; the physically unpopulated C83 model is removed from a temporary render copy. Raw Skylabs exports are not published because several populated packages still lack verified models.

**Why:** rotation adds physical understanding only when the model is credible. It should supplement the more immediately useful photograph or inspection image.

Sources:

- [Baymard Institute — Video and 360-degree views](https://baymard.com/ecommerce-design-examples/video-and-360-views)
- [Journal of Retailing and Consumer Services — 3D presentation quality](https://www.sciencedirect.com/science/article/pii/S0969698916306300)
- [Apple Human Interface Guidelines — Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)

## 3. Provide non-drag controls and avoid automatic motion

**Decision:** board rotation starts only after the visitor selects Rotate. Dragging, previous/next buttons, Home and arrow keys all control the same state. Nothing auto-spins.

**Why:** purposeful, user-controlled motion communicates the board’s physical form without becoming background distraction, and it leaves an alternative to a dragging gesture.

Sources:

- [W3C — Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Nielsen Norman Group — Animation for Attention and Comprehension](https://www.nngroup.com/articles/animation-usability/)

## 4. Let project evidence carry the hierarchy

**Decision:** retain the light-table Polaroid system for the portfolio, use the dark inspection bench only inside PCB labs, and give large board photography or renders more visual weight than decorative interface elements. Bright film colours remain accents; small red text uses a darker accessible tone.

**Why:** spacing, scale and restrained colour make the photographed hardware the focal evidence while keeping the themed frame recognisable.

Sources:

- [Atlassian Design System — Spacing](https://atlassian.design/foundations/spacing)
- [Material Design — Color](https://m1.material.io/style/color.html)
- [Office for National Statistics — Accessible text formatting](https://service-manual.ons.gov.uk/brand-guidelines/typography/accessible-text-formatting)

## 5. Edit copy locally, not into a single marketing voice

**Decision:** preserve concrete first-person lines and technical details. Remove only vague labels, filler and manufactured contrasts. No project claims or personal details were invented.

**Why:** concise, specific wording scans faster and sounds like the engineer who did the work. Over-editing already-good passages would erase that voice.

Sources:

- [Nielsen Norman Group — Be Succinct](https://www.nngroup.com/articles/be-succinct-writing-for-the-web/)
- [Microsoft Writing Style Guide — Use simple words and concise sentences](https://learn.microsoft.com/en-us/style-guide/word-choice/use-simple-words-concise-sentences)
- [W3C WAI — Writing for Web Accessibility](https://www.w3.org/WAI/tips/writing/)

The two user-supplied editing guides were used as editorial checklists, not as authorities for factual claims:

- [jpeggdev/humanize-writing](https://github.com/jpeggdev/humanize-writing/blob/main/SKILL.md)
- [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing/blob/main/SKILL.md)

## 6. Keep rich media responsive and off the critical path

**Decision:** rotation frames are WebP, the first frame is preloaded only on the TramTrace lab, and the remaining frames are fetched after Rotate is selected. Listing pages load one lazy preview rather than the whole sequence. The oversized ScopeLab listing image now uses a WebP source with its original PNG retained as a fallback and social image. Intrinsic image dimensions and responsive CSS prevent layout shifts and overflow.

**Why:** the board should remain sharp without making every portfolio visitor download the interaction.

Sources:

- [web.dev — Serve responsive images](https://web.dev/articles/serve-responsive-images)
- [MDN — Multimedia performance](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/Multimedia)
- [W3C — Technique C37: fitting images for reflow](https://www.w3.org/WAI/WCAG22/Techniques/css/C37)

## 7. Make image and component interactions explicit

**Decision:** PCB view and layer controls are named, pressed state is exposed, component markers have larger hit areas, and a synced component index provides a keyboard- and touch-friendly alternative to selecting by position. Project photographs carry a quiet `Enlarge` cue, linked lab cards describe their destination, and new-tab file links name that behaviour for assistive technology.

**Why:** a visitor should be able to predict what a control or destination will do before using it.

Sources:

- [W3C — Link Purpose in Context](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)
- [W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [U.S. Web Design System — Link](https://designsystem.digital.gov/components/link/)
- [GOV.UK Design System — Links](https://design-system.service.gov.uk/styles/links/)
