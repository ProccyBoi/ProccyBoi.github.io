# Andrew Chung — electrical engineering portfolio

Personal portfolio and public project archive published at:

- https://proccyboi.github.io/

## Main routes

- `/` — hardware-led portfolio with selected builds, interactive data paths and a concise engineering introduction
- `/about/` — profile, experience, education, tools and public CV
- `/book/` — live free/busy booking page for 15–60 minute online or in-person meetings
- `/projects/` — complete project index, including browser-based engineering tools
- `/projects/tramtrace/` — light-rail display case study with an integrated PCB and data explorer
- `/projects/skylabs/` — Skylabs system case study with integrated aircraft and ground-station board explorers
- `/projects/framework-expansion-card/` — ESP32-S3 Framework card case study with its integrated WebGL model
- `/projects/framework-dual-usb/` — dual USB-C Framework card case study with its integrated WebGL model
- `/projects/rf-test-board/` — VNA feedline and filter test board
- `/projects/scopelab/` — ScopeLab browser-based micro:bit and oscilloscope teaching bench
- `/projects/lithography-animation/` — interactive optical lithography and resist-process teaching model
- `/projects/mosfet-operating-regions/` — interactive long-channel MOSFET operating-region explorer
- `/projects/skylabs/boards/telemetry/` — Skylabs telemetry / avionics board
- `/projects/skylabs/boards/ground-station/` — Skylabs ground-station board
- `/shared/flight-review/` — local binary/Excel flight-log review with synchronized 3D replay
- `/shared/` — public files organised by uni, work and projects
- `/shared/projects/skylabs/f110211/` — interactive F110211 flight replay

Legacy links under `/lab/` and `/reports/f110211/` remain supported. Most redirect to their canonical project pages; the RF Test Board and Metroboard lab routes retain their standalone explorers.

## Shared presentation and explorers

Design tokens and shared page patterns live in `assets/site.css`, with case-study layouts in `assets/project-flow.css` and `assets/project-integrated.css`. The site uses self-hosted Archivo and IBM Plex Mono fonts.

`assets/explorer-runtime.js` handles rendering visibility and unsupported-WebGL states for the four WebGL engines. It pauses rendering offscreen or in a hidden tab without replacing source-derived geometry, textures, component placement or models. Skylabs keeps its own rendering and interaction system.

Run `python scripts/audit-site.py` for structural, link, asset and skip-link checks. Browser QA is still required for visual changes and interactive hardware.

## Content rules

- Public project claims are sourced from the supplied CV, confirmed project material, readable board silkscreen or direct user statements.
- No phone number or private address is published.
- The downloadable CV is a purpose-built public copy with those details removed.
- New project photography comes from the authorised electronics-photo archive. Existing rUNSWift, LoRa Talkie, Dash and Metroboard images were explicitly retained.
- Published derivatives are resized and stripped of source EXIF/GPS metadata.
- The F110211 replay contains its exact recorded GPS route; that disclosure is shown before opening it.

## Updating shared material

Add stable pages under the relevant hierarchy:

```text
shared/
├── uni/
├── work/
└── projects/
    └── skylabs/
```

Each new item should be linked from its parent folder page and from `sitemap.xml` when it is intended to be discoverable.

## Rebuilding generated assets

- `scripts/process-images.ps1` creates responsive JPEG derivatives and copies the explicitly approved existing project images.
- `scripts/process-project-imports.ps1` creates responsive JPEGs for a selected, structured photo import.
- `scripts/create-webp.py` creates WebP derivatives.
- `scripts/build-public-cv.py` builds the public CV into both `output/pdf/` and the website documents folder.

The site is plain HTML, CSS and JavaScript. Pushes to `main` publish automatically through GitHub Pages.

## New portfolio at `/v2/`

The independently styled version lives at `/v2/`, with its project collection at `/v2/projects/` and profile at `/v2/about/`. It includes the original fourteen projects and the Raspberry Pi RP2354B expansion card, while leaving the original public routes intact.

The fullscreen opening presents the ESP32 card, Raspberry Pi card and TramTrace, with their physical components assembling and separating as the reader scrolls. The model factory merges the original CAD faces within component groups for efficient rendering. `assets/v2-assembly-models.js`, `assets/v2-assembly.js` and `assets/v2-assembly.css` own this scene. The surrounding light gallery uses `assets/v2.css` and `assets/v2.js`; case-study styles/controllers are `assets/v2-case.css` and `assets/v2-cases.js`.

The Raspberry Pi page includes an on-demand 3D inspector with its exact board, a reference Framework enclosure, camera presets and component separation. Rendering pauses offscreen and when idle. Reduced motion, Save Data, unavailable WebGL and JavaScript-disabled browsing retain still images and project navigation. Finite section transitions use `assets/v2-motion.css` / `.js`.

- Run `python scripts/build-v2-cases.py` to regenerate the case-study, collection and about pages from the original factual material.
- Run `python scripts/audit-v2.py` to check every v2 page, project inventory, linked assets, metadata and fragments, including untracked files.
- With Playwright installed, run `node scripts/verify-v2-browser.cjs` against the running preview for mobile, keyboard, search, CAD, fallback and reduced-motion acceptance checks. Optional environment variables: `V2_BASE_URL`, `CHROMIUM_EXECUTABLE`.
- Also run `node scripts/verify-v2-motion.cjs` and `node scripts/verify-v2-cad-motion.cjs` for responsive assembly choreography, idle/offscreen rendering, component-pose continuity and reverse scrolling. The motion check optionally saves review frames to `V2_SCREENSHOTS`.
- Serve the repository root (for example `python -m http.server 8080`) and open `http://localhost:8080/v2/`.
- Design direction, image provenance and references are in [docs/v2-design.md](docs/v2-design.md).
