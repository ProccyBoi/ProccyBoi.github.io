# Flight Review acceptance and performance evidence

Run from the repository root. Official Playwright is pinned to **1.57.0** in the workflow. The browser scripts intentionally do not expose a production testing API or replace the application parser/renderers.

```sh
node scripts/verify-flight-review-parser.cjs
node scripts/verify-flight-review-runtime.cjs
node scripts/flight-review/verify-source.cjs
npm install --no-save --package-lock=false playwright@1.57.0
npx playwright install --with-deps chromium webkit
node scripts/flight-review/verify-browser.cjs --viewport=desktop1440
node scripts/flight-review/verify-browser.cjs --regression
node scripts/flight-review/verify-browser.cjs --engine=webkit --fallbacks --viewport=phone390
git worktree add --detach /tmp/flight-review-baseline d15883bd3945502c412121e1d434e04588f200d0
FLIGHT_BASELINE_ROOT=/tmp/flight-review-baseline node scripts/flight-review/profile.cjs
```

Use `FLIGHT_REVIEW_OUT` to choose an evidence directory (default `/tmp/flight-review-evidence/…`). Scripts start and close their own no-store static HTTP server. `FLIGHT_BROWSER_PATH` optionally selects an already-installed official browser. Do not use alternate launch flags or privilege escalation to bypass a denied sandbox operation.

## Fixtures and provenance

`fixtures.cjs` deterministically generates valid synthetic SKYLBIN1 v1/v2/v3 records with exact Float32 expectations, nonzero initial timestamps, known GPS/attitude/diagnostics, sparse decimal-precision CSV, irregular time spacing and absent GPS/optional values. No large generated binary is checked in. `node scripts/flight-review/fixtures.cjs` writes small examples and a SHA-256 manifest.

The 13,772-row F110211 CSV is reconstructed from the already-published JSON replay arrays in `shared/projects/skylabs/f110211/index.html`. It retains those arrays' rounding and processed values. It is **not the original F110211.BIN**, a new capture, or proof that original sensor bytes survived that earlier publication. Its manifest records the page hash and this limitation.

The performance fixture is the identical 120,001-row v3 binary for both revisions. Active cancellation uses 400,001 records (112,800,330 bytes), below the production 150 MiB limit.

## Browser coverage

- 1440 desktop; 390 and 320 phone; 768, 1024 and 1180 tablet viewport emulation, plus orientation changes. Screenshots cover onboarding, schema, charts and sample inspector. Native file input, dialog, keyboard tabs, range, controls and download flows are exercised.
- Default charts; no Three/MapLibre/SheetJS at entry; binary parsing without SheetJS; no external requests before the user selects terrain, including CSV worker import; no log upload requests.
- All binary versions, sparse/irregular/missing fields, raw numeric export/sample precision, full record counts, unknown diagnostics, template and CSV export, reconstructed published flight.
- True wall-clock replay at 0.25×, 1× and 4×; elapsed-time chart seeking rather than sample-index spacing; paused rendering stops; the document-visibility event pauses playback.
- Bad replacement retains prior log; cancel, newer-load race, repeated import; worker/library failure then retry; local/terrain runtime failure and retry; no-WebGL chart/sample/export fallback; no-Worker clear error; WebKit import/play/export.
- Synthetic persisted `pagehide`/`pageshow` during first/replacement parsing, followed by native away/Back navigation. The synthetic event verifies application lifecycle handling and does not assert real BFCache admission.
- Real local Three and MapLibre WebGL contexts in Chromium/ANGLE/SwiftShader. Provider style and DEM responses are deterministic fixtures; the suite does not prove public provider availability or real terrain accuracy. Missing DEM remains unavailable rather than synthetic zero elevation.

## Performance method and limits

Four pairs run in AB/BA/AB/BA order on one runner/browser process, each in a fresh context against identical local servers. Baseline is pinned to `d15883bd3945502c412121e1d434e04588f200d0`; JSON records exact candidate SHA, dirty status, browser/Playwright/Node version, fixture hashes and every sample.

Cold entry is measured separately from file-to-charts. Both revisions are explicitly switched to Charts for seek/play comparisons. File-to-charts includes reading, parsing, model construction/transfer, first chart preparation and the baseline's eager 3D work. Switching the default view is part of the measured UX change: this number is **not isolated parser throughput**. `encodedBodySize` counts uncompressed local HTTP response body bytes; transfer size includes browser-reported HTTP overhead. Neither is a compressed internet download measurement.

A 20 ms main-thread heartbeat and Long Tasks observer report responsiveness; scrub latency is input-to-observed-readout plus one animation frame. Replay compares log seconds to actual elapsed browser time. Reported medians retain all raw runs; gates target deterministic byte reduction, correct replay, idle work, a broad 200 ms scrub p95 and 750 ms ingestion heartbeat budget. Provider responses are mocked identically. Performance on real phones, hardware GPUs, real Safari and internet networks remains unmeasured.

Artifacts upload even on failure and include screenshots, fixture manifest, complete test JSON and benchmark JSON. A missing, failed or unrun browser job is not a pass. Local browser launch in the development sandbox was denied at Chromium `process_singleton_posix.cc` (`socket(): Operation not permitted`); no bypass was attempted. Source/fixture tests are independently runnable; browser evidence must come from the exact candidate Actions run.
