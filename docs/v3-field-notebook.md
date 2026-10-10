# v3 engineering field notebook

Approved direction implemented 10 October 2026. This is the current v3 design
contract; the aircraft studies and earlier v3 sketch documents remain historical
records of their individual experiments. `/`, `/v2/`, shared applications,
original photographs and engineering model assets stay intact.

## Recruiter route

The first screen identifies Andrew Chung, electrical engineering at UNSW and his
Skylabs role. Projects, About, Tools, Files, Book, CV and Contact are ordinary
links. A visitor never has to complete the aircraft story to use them.

The home proceeds from the accepted aircraft-to-telemetry sequence to a concise
system explanation; two detailed, physical examples (TramTrace and Dual USB-C);
more project routes; teaching and flight-review tools; background and contact.
The individual project records state contribution, constraint, a design decision,
actual evidence and its limits. They are sourced in
`scripts/content/v3-case-evidence.json`, whose source routes and fragments are
validated by the generator.

Skylabs' logging rate is a target, not a measured achievement. F110211's published
50.0 ms log interval, 13,402 overruns and zero SD write errors remain together.
RP2354B is labelled as design/CAD evidence, without suggesting a tested build.
The root TramTrace copper/data-frame inspector remains the canonical complete
inspector; v3 links directly to it rather than duplicating its controllers.

## Composition and type

- Paper `#f3f2eb`, graphite `#222b28`, secondary ink `#5d655f`, divider
  `#c9cec4`, restrained copper `#94502d`
- IBM Plex Sans, regular and medium, for prose and headings; JetBrains Mono for
  units, component identity and the small engineering record labels
- Original dark aircraft and CAD environments are scoped locally. Their colours,
  materials, meshes, camera and accepted motion are not replaced by the paper
  theme. Readouts and controls retain contrast in that context.
- Photographs are single, flat frames. The illuminated TramTrace photograph is
  wider than its explanation; the installed USB card follows with the inverse
  reading arrangement. There are no decorative circuit diagrams, invented status
  panels, stock engineering assets or overlapping photo stacks.
- The only diagram-like home element is the actual acquire → radio → replay
  explanation. It is static, semantic HTML, with direct links and no simulated
  measurements.
- A mobile menu starts at 800 px, since seven links cannot fit the desktop header.
  Without JavaScript the same links wrap in ordinary document flow.

## Toolkit decisions and provenance

The approved research brief surveyed 1,011 personal sites (956 lightweight,
55 deeper, 11 of those visually reviewed) and 108 official/maintainer resource
pages. Those counts describe reference research, not runtime or usability tests.
The implementation also preserves the reference-to-decision record in
[`DESIGN.md`](../DESIGN.md), rather than replacing it with a generic style kit.

- [Anthropic Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
  was reviewed for subject-specific composition, factual content and restraint.
  It is a critique reference; no skill text or implementation was copied.
- [Vercel interface guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  informed the keyboard, focus, motion, failure and responsive checks.
- [IBM Plex](https://github.com/IBM/plex) supplies the two original, unmodified
  WOFF2 files from `packages/plex-sans/fonts/complete/woff2/`.
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) supplies the
  original `fonts/webfonts/JetBrainsMono-Regular.woff2`.
- Both font families are redistributed with SIL OFL 1.1 notices in
  `assets/fonts/IBM-Plex-Sans-OFL.txt` and `JetBrains-Mono-OFL.txt`. The font files
  are local; visits make no font-CDN requests.
- Existing Three.js, models, gallery, query controller and teaching tools remain.
  No React migration, second animation library, synthetic telemetry or extra
  image library was introduced.

## Preservation and verification

All 15 collection entries, 23 generated interiors, two Skylabs board pages,
public CV, booking, original shared tools, root routes and v2 routes stay
available. The home and all v3 interiors expose the shared resource routes.
`build-v3-pages.py` remains the source of generated interiors, with v3-only
content additions. Do not edit generated interiors independently.

The aircraft controller, scene, atmosphere, electronics and geometry assets are
byte-for-byte unchanged by this overhaul. Its only destinations remain Aircraft
and Telemetry. The approved clearance before rigid explosion and exact reverse
poses are checked by the existing renderer-free suites.

[`v3-portfolio-validation.md`](v3-portfolio-validation.md) records the acceptance
matrix and actual verification limits. The browser workflow runs on the
`v3-field-notebook` review branch, with read-only repository permissions. Its
screenshots and JSON report are required for rendered acceptance. It never
submits a booking or transmits a user flight log.
