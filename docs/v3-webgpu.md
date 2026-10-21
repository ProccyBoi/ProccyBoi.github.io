# v3 WebGPU experiment

v3 was reset from the complete current v2 portfolio at commit `8e24c7d18bd745cdaf7b6b23ef87db8bb5f6ea33`. The previous v3 is retained in the durable branch `backup/v3-before-webgpu-20261019`. The review branch is `experiment/v3-webgpu-20261019`.

## Boundaries

- All 27 v2 routes are inherited, including the current Kiku firmware simulator, booking page and Flight Review redirect.
- Internal portfolio links, metadata and canonicals point to v3.
- Mutable experiment scripts and styles live below `v3/assets/`. Existing root assets, v2, the root portfolio, lab tools and shared Flight Review are unchanged.
- Original model geometry, images, fonts, firmware and immutable legacy libraries may still be read from shared root asset URLs. Their bytes are not changed.
- `scripts/build-v3-pages.py` deterministically copies current v2 HTML and adds v3-only experiment entry points. It does not overwrite experiment JavaScript.

## Experiments

The aircraft has an isolated modern renderer path and a legacy fallback. The experiment preserves direct section navigation, readable content, motion preferences and still-image fallback. A real-image inspection lens gives the existing Kiku render a focused magnified view; it never invents component detail or source data.

Renderer implementation and measured results will be documented after integration and independent verification. No speedup is assumed from the API name. A browser exposing `navigator.gpu` alone is not proof that a scene used WebGPU or that physical GPU hardware was exercised.

## Verification

- `python3 scripts/build-v3-pages.py --check`
- `python3 scripts/audit-v3.py`
- `node scripts/verify-v3-aircraft-transport.cjs`
- Browser checks in `scripts/v3-webgpu/` exercise mobile and desktop, copied routes, explicit fallback and actual rendering diagnostics.

Compare v2 and v3 using the same viewport, model geometry, pixel ratio, lighting and shadow settings. Separate cold network/load time, time to a usable 3D frame, warm startup and sustained frame timing. Software-adapter headless runs establish correctness only; they cannot establish real-device speed or battery improvement.
