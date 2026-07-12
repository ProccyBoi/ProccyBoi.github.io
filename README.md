# Andrew Chung — Electrical Engineering

Personal portfolio and public project archive published at:

- https://proccyboi.github.io/proccy-boi/

## Main routes

- `/` — landing page and selected-work bench index
- `/about/` — profile, experience, education, skills and public CV
- `/projects/` — project index and project detail pages
- `/projects/skylabs/boards/telemetry/` — Skylabs telemetry / avionics board
- `/projects/skylabs/boards/ground-station/` — Skylabs ground-station board
- `/shared/` — hierarchical public archive
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
- `scripts/create-webp.py` creates WebP derivatives.
- `scripts/build-public-cv.py` builds the public CV into both `output/pdf/` and the website documents folder.

Pushes to `main` publish automatically through GitHub Pages.
