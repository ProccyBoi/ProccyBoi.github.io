# Andrew Chung — electrical engineering portfolio

Personal portfolio and public project archive published at:

- https://proccyboi.github.io/

## Main routes

- `/` — Polaroid-inspired landing page with an engineering introduction, condensed experience and selected projects
- `/about/` — profile, experience, education, tools and public CV
- `/book/` — live free/busy booking page for 15–60 minute online or in-person meetings
- `/projects/` — complete project index and individual project pages
- `/lab/` — hardware explorers and browser-based engineering tools
- `/lab/skylabs/` — 360° aircraft telemetry and ground-station board explorer
- `/lab/framework-esp32/` — WebGL Framework ESP32 expansion-card model
- `/lab/framework-dual-usb/` — WebGL dual USB-C expansion-card model
- `/projects/tramtrace/` — live Sydney and Parramatta light-rail display PCB
- `/projects/framework-dual-usb/` — dual USB 2.0 Type-C Framework expansion card
- `/projects/rf-test-board/` — VNA feedline and filter test board
- `/projects/scopelab/` — ScopeLab browser-based micro:bit and oscilloscope teaching bench
- `/projects/lithography-animation/` — interactive optical lithography and resist-process teaching model
- `/projects/mosfet-operating-regions/` — interactive long-channel MOSFET operating-region explorer
- `/projects/skylabs/boards/telemetry/` — Skylabs telemetry / avionics board
- `/projects/skylabs/boards/ground-station/` — Skylabs ground-station board
- `/shared/flight-review/` — local binary/Excel flight-log review with synchronized 3D replay
- `/shared/` — public files organised by uni, work and projects
- `/shared/projects/skylabs/f110211/` — interactive F110211 flight replay

The legacy `/reports/f110211/` route redirects to the archive so previously shared links continue to work.

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
