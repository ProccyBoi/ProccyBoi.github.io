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

Pending after release 1 is live.

## Final review

Pending after the refinement releases.
