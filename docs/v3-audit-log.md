# Portfolio V3 audit log

## Round 1 — baseline

Baseline: `aaffea480bab04485d9136e2ea0c593a217b88f5`

The first independent audit used 17 primary routes, two viewports (`1440 × 900` and `390 × 844`) and seven review dimensions per route: navigation, responsive layout, semantics, interaction, visual hierarchy, media performance and copy. Additional rUNSWift and ScopeLab mobile checks plus ten ultrawide project-navigation checks brought the documented total to **262 audit cells**. A separate crawl confirmed all 30 discoverable public routes returned HTTP 200.

### Reproducible findings

| Priority | Finding | First-release action |
|---|---|---|
| P0 | `Next project` title column collapsed to 0 px at 2560 px on all ten detail pages tested | Make the outer link full width and retain a centred content gutter |
| P0 | Figure-based project heroes caused horizontal overflow at 390 px | Reset browser default figure margins |
| P1 | TramTrace and Skylabs hotspot targets measured only 20–22 px | Increase hit areas while retaining the small visible markers |
| P1 | Small red labels missed 4.5:1 contrast | Add a darker `--red-text` token for copy; keep bright red decorative |
| P1 | PCB inspectors were not visible at the Labs destination | Add both existing inspectors before the other browser labs |
| P1 | Empty Files categories created dead ends | Link directly to Flight Review and the F110211 replay |
| P2 | Visitor-facing names alternated between Experience/About and Labs/Interactive | Standardise the primary label to About and the jump label to Labs |

The audit also confirmed one H1, one main landmark, no duplicate IDs or heading skips on the primary routes, working mobile-menu focus management, reduced-motion coverage, and no console errors on the baseline route sweep.

## Round 2

Release 1 baseline: `8df7438f825edb48b47a881c05015b63a663923f`

The production follow-up repeated the route audit after deployment. The automated audit now applies six explicit review cells to every tracked document—parseability, unique identifiers, primary landmark and H1, route metadata, image alternatives, and local links/media—for **198 passing cells across 33 documents**. Browser checks then exercised the two PCB board selectors, component selection, annotation visibility, rotation controls, and both standalone engineering labs.

### Reproducible findings

| Priority | Finding | Second-release action |
|---|---|---|
| P1 | Lithography and MOSFET labs were visual and navigational dead ends | Add a compact portfolio masthead, skip link and direct routes to Projects, Labs and About |
| P1 | PCB markers were larger, but selecting a dense board component still depended on its position | Add a collapsible, keyboard-operable component index synced to the board markers on both TramTrace and Skylabs |
| P2 | Project photographs opened a lightbox but did not advertise that behaviour on touch screens | Add a restrained `Enlarge` cue inside the photograph frame |
| P2 | Range inputs in the standalone labs retained narrow browser-default tracks | Increase their interaction height without changing the models |
| P2 | The 404 route had a title but no description | Add route metadata and make it part of the repeatable audit |

No private project, unverified Skylabs render, project source file or CV asset changed in this release.

## Round 3

Release 2 baseline: `387eb27a31259c4a0c74c08ba4de5d1c63f6ee68`

The third pass extended the same audit with explicit button behaviour, safe new-window relationships and validation of every local fragment destination. That produced **297 passing cells across 33 documents**.

### Reproducible findings

| Priority | Finding | Third-release action |
|---|---|---|
| P1 | Flight Review had routes back to Skylabs, but no direct exit to the portfolio | Add `Portfolio` to the tool header while retaining the project and reference-flight routes |
| P2 | The Projects page downloaded a 1.64 MB ScopeLab PNG when its card came into view | Serve a 110 KB WebP with the PNG retained as the social/fallback asset |
| P2 | Four tabs in the self-contained F110211 replay relied on the browser's default button type | Mark every tab as `type="button"` and add that rule to the repeatable audit |
| P2 | Broken section links could pass the previous file-existence check | Resolve and validate fragment IDs across all tracked documents |

The ScopeLab preview transfer is approximately 93% smaller in browsers with WebP support. The interactive model and full-resolution fallback are unchanged.

## Final review

Release 3 baseline: `2cc76ed0cfe1115768e7f94ddf74176c0ccc43af`

The final pass added a primary-navigation current-state assertion, bringing the repeatable local matrix to **330 passing cells across 33 documents**. A parallel production crawl requested all 27 sitemap routes after release 3; every route returned HTTP 200.

One genuine cleanup remained: the empty Uni and Work file placeholders were still marked for indexing and listed in the sitemap even though they had already been removed from the visible Files page. The final patch marks those placeholders `noindex,follow` and removes them from the sitemap. The public Flight Review, Skylabs folder and F110211 replay remain discoverable.

Final browser checks covered:

- homepage identity, primary routes and selected-work links;
- Projects jump navigation and current-state behaviour;
- TramTrace inspect, copper, data and rotation views;
- Skylabs telemetry/ground switching, annotations, component index and rotation;
- photo lightbox cues and keyboard activation;
- standalone lab exits and skip targets;
- Flight Review portfolio/project/reference routes;
- ScopeLab WebP selection and F110211 tab switching.

No CV asset, KiCad source, unpublished project or private project was changed across the final pass.
