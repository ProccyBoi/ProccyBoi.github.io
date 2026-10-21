# v3 WebGPU experiment

v3 was reset from the complete current v2 portfolio at commit `8e24c7d18bd745cdaf7b6b23ef87db8bb5f6ea33`. The previous v3 is retained in the durable branch `backup/v3-before-webgpu-20261019`. The review branch is `experiment/v3-webgpu-20261019`.

## Boundaries

- All 27 v2 routes are inherited, including the current Kiku firmware simulator, booking page and Flight Review redirect.
- Internal portfolio links, metadata and canonicals point to v3.
- Mutable experiment scripts and styles live below `v3/assets/`. Existing root assets, v2, the root portfolio, lab tools and shared Flight Review are unchanged.
- Original model geometry, images, fonts, firmware and immutable legacy libraries may still be read from shared root asset URLs. Their bytes are not changed.
- `scripts/build-v3-pages.py` deterministically copies current v2 HTML and adds v3-only experiment entry points. It does not overwrite experiment JavaScript.

## Experiments

1. **Native WebGPU aircraft and telemetry.** A locally vendored Three r186 renderer owns a separate modern scene, without replacing the page's legacy Three global. Original model geometry, authored separation/peel motion, camera framing and telemetry artwork are retained. WGSL/TSL atmosphere and modern output-managed materials replace unsupported legacy shader hooks. Telemetry's color-space conversion and blue coating are explicit.
2. **Progressive fallback and pacing.** Unsupported WebGPU, missing adapters, initialization failure and device loss switch to an isolated legacy WebGL renderer on a fresh canvas. Images remain available without graphics or JavaScript. Reduced motion, Save Data and short viewports use the static presentation. Work pauses offscreen, and every published modern live pose waits for its real GPU queue and validation scopes.
3. **Kiku original-image inspection.** A keyboard/touch-accessible detail lens samples the existing high-resolution image with a small WGSL pipeline, or Canvas2D when WebGPU is unavailable. It only redraws after input and does not invent image detail. Closing/reopening during loading, device loss, focus return and repeated dismissal are tested.

See [`v3/assets/webgpu/README.md`](../v3/assets/webgpu/README.md) for renderer, model and vendor provenance. No speedup is assumed from the API name. A browser exposing `navigator.gpu` alone is not proof that a scene used WebGPU or that physical GPU hardware was exercised.

Use `/v3/?renderer=webgpu#skylabs-aircraft` for the real progressive WebGPU path, or `/v3/?renderer=webgl#skylabs-aircraft` to explicitly compare the fallback. `window.V3WebGPU.snapshot()` reports the actual backend and completed-frame evidence. The Kiku lens is on `/v3/projects/kiku/`.

## Verification

- `python3 scripts/build-v3-pages.py --check`
- `python3 scripts/v3-webgpu/verify-isolation.py`
- `python3 scripts/audit-v2.py`
- `node scripts/v3-webgpu/verify-loader.cjs`
- `node scripts/verify-v3-aircraft-transport.cjs`
- `node scripts/kiku-simulator/verify.cjs`
- `node scripts/verify-flight-review-runtime.cjs`
- Browser checks in `scripts/v3-webgpu/` exercise desktop/mobile layouts, copied routes, explicit fallback, actual draw/submit/queue-completion evidence, GPU loss, forced GC, interrupted startup/preferences and idle/offscreen pacing. Booking is fully mocked and external requests are blocked.

The workflow `.github/workflows/verify-v3-webgpu.yml` tests the experiment branch without publishing Pages. Chromium uses pinned Playwright, full headed Chromium under Xvfb, and a matched software Vulkan stack. The exact launch arguments are in `scripts/v3-webgpu/browser-config.cjs`. A blank-canvas smoke test validates native queue completion and a known pixel before the site tests run. Earlier Linux headless/ANGLE configurations lost the WebGPU device even on that independent clear-pass test; they are recorded as negative diagnostic controls, not renderer failures.

To reproduce on a Linux test host with the official Playwright dependencies, Vulkan loader/drivers, Xvfb and xauth installed, start a repository-root HTTP server at `127.0.0.1:8080`, then run:

```sh
xvfb-run -a node scripts/v3-webgpu/diagnose-backend.cjs --require-ci-config
xvfb-run -a node scripts/v3-webgpu/verify-browser.cjs --require-webgpu
node scripts/v3-webgpu/verify-browser.cjs --webkit
xvfb-run -a node scripts/v3-webgpu/profile.cjs
```

The SwiftShader flags are for trusted test pages on isolated CI hosts, not recommended end-user browser settings. These software-adapter runs establish browser correctness and visible output, not physical GPU performance or exhaustive device compatibility.

## Performance method and limits

`profile.cjs` runs without the correctness observers. It records v2 WebGL, v3 WebGL and actual v3 WebGPU on the same runner, viewport and browser, in forward then reverse order. Each variant gets initial and repeated **uncached** page loads and 15 deterministic completed-pose samples. It refuses to report WebGPU timings if the renderer silently fell back.

Request interception disables HTTP cache, so the repeated load is not a warm-cache benchmark. Loopback serving removes real-world network latency. Pose response includes scheduling, rendering and native completion, rather than isolated GPU timer queries. The modern lighting/material pipeline differs from the legacy renderer, so the observations are not pixel-identical comparative benchmarks. No real-device speedup or battery improvement is claimed; those require hardware-browser profiling with matched visual settings.
