# Flight review

`/shared/flight-review/` reviews Skylabs binary v1–v3, XLSX/XLS workbooks, CSV and TSV locally. Its charcoal surfaces, Archivo/IBM Plex Mono typography and restrained blue controls follow `/v2/` without changing the portfolio itself.

## Loading and privacy

The entry page loads only its UI script, styles and self-hosted fonts. Selecting a file starts a dedicated worker; binary parsing requires no spreadsheet or graphics library. Spreadsheet formats load the vendored SheetJS runtime inside the worker. Final numeric arrays are transferred as Float64 buffers without changing their precision. Cancel terminates the worker, and failed or canceled replacements keep the prior valid flight available.

Telemetry opens first. Local 3D loads Three.js only when selected, and works without map providers. Selecting 3D terrain loads MapLibre and requests basemap/elevation data for the viewed region from OpenFreeMap and Mapterhorn. Satellite is optional and uses MapTiler. Files and telemetry are not uploaded. No analytics or telemetry collection was added. A browser without workers receives an explicit import error; it does not silently run a large parser on the UI thread.

## Interpretation and correctness

- Parsed source channels retain their full resolution. Display position and altitude can fill missing samples; normalized CSV retains the original tool's filled-coordinate/altitude and derived-speed semantics. The inspector and copied sample JSON also expose recorded latitude/longitude.
- Ground speed is estimated from the position track. It is not a replacement for measured airspeed.
- Terrain height and the adjustable clearance clamp are illustrative. They are not measured AGL or evidence of safe clearance.
- Charts use elapsed time rather than sample number. Pixel buckets retain first/last samples, minima/maxima and missing-value breaks, including narrow spikes. This only reduces display geometry; exported values are not downsampled.
- Playback uses a continuously accumulated clock, so fractional time is retained between recorded samples. Pausing, stepping and scrubbing still select exact samples. Playback pauses when the document becomes hidden.
- Coordinate validation now accepts equator/prime-meridian fixes and rejects out-of-range latitude/longitude. A (0, 0) pair requires an explicit positive fix. Missing diagnostic counters are unavailable rather than zero; the UI does not infer healthy logging from absent fields.
- A missing terrain elevation (`null`) stays unavailable instead of being mistaken for sea-level terrain.

## Rendering

Static chart traces are drawn once per dataset/size, with separate lightweight cursors during playback. Sample values reuse existing DOM nodes. Only the selected view updates. Local 3D draws on demand, pauses out of view or in a hidden document, and is disposed when the flight changes. Map marker endpoints are cached rather than rescanning the whole log each frame. CSV export yields between 2,000-row chunks.

## Verification

Baseline: `d15883bd3945502c412121e1d434e04588f200d0`.

Run `node scripts/verify-flight-review-parser.cjs` for exact numerical comparisons with the frozen pre-change parser, binary schema/malformed-input cases, spreadsheet aliases, approved correction cases and worker transfer/import checks. The baseline fixture contains only the parser code required for these comparisons.

The browser workflow, `verify-flight-review.yml`, runs exact-commit browser regressions and captures viewport-emulated screenshots and matched before/after performance measurements. Synthetic logs are clearly labelled. Where the published F110211 replay is reconstructed into CSV for a test, it is a reconstruction of published arrays, not the original aircraft binary. Mocked provider tests establish UI and failure behavior, not availability or accuracy of live map providers.

Do not infer physical-device performance from headless Chromium/SwiftShader or WebKit viewport emulation. Timing results depend on hardware, browser and file size. Keep measurements tied to their commit and fixture rather than claiming an unconditional speed multiplier.
