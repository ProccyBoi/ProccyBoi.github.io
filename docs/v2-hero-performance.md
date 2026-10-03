# Hero geometry and loading

The homepage loads prepared versions of the existing TramTrace, Skylabs telemetry and Pi assemblies. Source CAD files, standalone viewers, photography, poster resolution, render pixel ratio and SVG texture resolution remain unchanged.

The build runs the existing factories once and records their final geometry, materials, scene hierarchy, physical references and motion origins. Vertices may share an index only when all their attribute bytes match. No triangle is removed, no coordinates are quantized and no normal, UV or colour data is approximated. Material colours are stored as linear RGB values rather than rounded hex colours.

The hero downloads these prepared assets alongside Three.js, directly creates their renderable buffers and loads the original silkscreens. It no longer needs GLTFLoader or the two source factories on a successful normal visit. A failed prepared asset uses the corresponding source factory; a failed source keeps that project's moving poster. Reduced motion and Save Data retain the static composition without downloading either set of models.

Packs ship as explicit `.idx.bin.gz` files, decoded with the browser's native `DecompressionStream`. This keeps delivery compressed regardless of the host's MIME policy. Before compression, each triangle-index array is rearranged into byte lanes; the browser reverses that arrangement into the exact original bytes. Vertices, triangle order and material data do not change. The three files total 2,366,153 bytes, 26.8% less than the preceding 3,234,732-byte gzip assets. Decoding yields between bounded chunks when its work exceeds an 8 ms budget.

Browsers without native decompression use the identical `.bin` data. The preceding `.bin.gz` files remain available for cached older loaders. New filenames and a versioned loader URL prevent a cached old script from receiving the new transport format.

## Immediate interaction

`assets/v2-hero-loading.js` and `.css` start independently of Three.js. A lightweight 2D field uses colours and positions sampled from the original board posters, with a diagonal light sweep following each board's alpha silhouette. Moving over a board lifts the field and opens a soft magnifying lens onto its full-resolution image; a tap briefly inspects that area and sends a radial pulse through the nearby samples. The lens never substitutes fabricated component detail.

The heading, project links, native scrolling and original posters remain available throughout. Each finished CAD assembly appears immediately, with its own short field fade; there is no minimum loading duration or invented progress percentage. Loading animation pauses offscreen, in a hidden tab, under reduced motion or Save Data, and stops after all models have either appeared or failed. Pointer and touch handling is passive and does not capture scrolling.

The light sweep uses small cached alpha masks on the same 2D canvas. The field and its small lens buffers request CPU backing, avoiding promoted CSS mask layers competing with WebGL startup. Original posters and the magnifying lens retain their full resolution. Canvas paints are capped at 30 per second.

## Prepared lighting

The original PMREM studio environment is baked into a 124,717-byte compressed asset. All 768×768 native RGBE texels, their encoding, filtering and layout are preserved. `scripts/build-v2-hero-environment.cjs` compares the source and prepared environment across all three complete CAD models in both assembled and exploded poses; all six comparisons produced zero changed pixel channels. `--verify` checks an existing build. Failed prepared lighting falls back to the same original PMREM construction.

The geometry files and lighting download together while Three.js starts. The original SVG silkscreens begin fetching as soon as model headers are available and their Image objects are reused at full resolution when textures are constructed.

## Rebuilding

Serve the repository root, then run `node scripts/build-v2-hero-assets.cjs`. `V2_BASE_URL` defaults to `http://127.0.0.1:8080`; `CHROMIUM_EXECUTABLE` can select an existing Chromium installation, and the Node environment needs Playwright. The build uses a blank same-origin page, evaluates the original factories and verifies the actual reconstructed pack objects against them. `--verify` repeats this comparison without replacing the generated assets.

`assets/models/hero/manifest.json` records the source hashes, pack hashes, triangle counts and parity fingerprints. Expanded triangle attributes are compared byte for byte; material properties, texture URLs/settings, transforms and component metadata are compared structurally. Text source hashes normalize CRLF to LF so Windows and Linux agree. The site audit checks source freshness, generated file hashes and that each gzip file decompresses to its exact plain counterpart before deployment.

| Assembly | Physical groups | Meshes | Triangles |
| --- | ---: | ---: | ---: |
| TramTrace | 31 | 104 | 96,514 |
| Telemetry | 54 | 166 | 224,256 |
| Raspberry Pi | 33 | 87 | 49,564 |

All counts match the previous hero. Indexing only combines vertices whose complete attributes are identical.

## Lighting and motion

The warm key light now casts soft component shadows onto the boards and neighbouring parts. Its 2048-pixel shadow map follows the visible assemblies, preserving detail when one board fills the scene. The opening composition blends between identical unshadowed and shadowed key lights as the first board takes focus, keeping total illumination constant and avoiding one project's silhouette obscuring another. The existing environment, material response, exposure and fill lights are retained. Shadow maps update only during an actual scene render and are reused in the unshadowed overview; the hero stops rendering when settled, offscreen or hidden.

Hero motion has separate lift-off, spread, rotation and settling phases. Components use family and spatial stagger, restrained curved paths and independently timed tilts. Original exploded positions are retained; intermediate lateral deviation is bounded to 0.012 board spans. Reversing the scroll reconstructs the same pose, and returning to zero restores each original component position and quaternion exactly.

## Verification and measurement

- `node scripts/verify-v2-hero-startup.cjs` checks pre-WebGL pointer/touch interaction, actual magnification, mobile scrolling and links, per-model handoff, animation suspension, motion preferences and prepared-lighting recovery.
- `node scripts/verify-v2-hero-choreography.cjs` checks deterministic trajectories, reverse sampling, exact reassembly and bounded movement without changing geometry or materials.
- `node scripts/verify-v2-cad-motion.cjs` checks the actual rendered assemblies, physical reference coverage and desktop/phone framing.
- `node scripts/verify-v2-hero-loading.cjs` checks progressive loading, prepared-asset recovery and poster fallbacks.
- `node scripts/verify-v2-motion.cjs` checks responsive layouts, keyboard navigation, finite rendering, live reduced motion and context loss.
- `node scripts/profile-v2-hero.cjs` records cold-cache poster/readiness timings, geometry counts, transferred and decoded bytes, draw calls and main-thread long tasks. Set `HERO_PROFILE_GZIP=1` for the controlled gzip fixture, `HERO_PROFILE_OUT` for the report path and `HERO_EXPECT_PACKS=1` to reject a silent source fallback.

The performance comparison uses the same machine, Chromium software WebGL, 1440×1000 viewport, cache disabled, 10 Mbps throughput and 40 ms latency. Both versions use the same gzip fixture, because GitHub Pages already compresses the original GLBs. Decoded CAD size must not be presented as download size. Absolute timings depend on hardware; this comparison measures the implementation change under identical conditions.

The initial optimization was measured on 3 October 2026, comparing `bdb6983` with `f9d4187` (prepared geometry, richer motion and new shadows):

| Measurement | Before | After |
| --- | ---: | ---: |
| First CAD assembly ready | 6.39 s | 4.84 s |
| Lead TramTrace assembly ready | 23.24 s | 4.97 s |
| All three assemblies ready | 25.50 s | 5.75 s |
| Longest main-thread task | 15.50 s | 3.03 s |
| First contentful paint | 1.104 s | 1.212 s |
| CAD transfer, including response headers | 3.400 MB | 3.235 MB |

The all-model readiness time fell by about 77% in this test. Readiness is recorded after a successful CAD render, not just after downloading a file. The after run requires all three prepared assets and rejects a silent source-factory fallback. The profiler separately records HTTP-decoded file sizes and application-decoded CAD sizes, since an explicitly gzipped file is decompressed by the application rather than HTTP.

The interactive-loading update uses a fresh three-run comparison against the committed `f9d4187` site, with the same settings above. Each set starts a fresh browser and uses three separate cache-disabled contexts. These are medians; the earlier single-run table is not reused as this update's baseline.

| Measurement | `f9d4187` | Interactive loading |
| --- | ---: | ---: |
| Loading interaction starts | — | 0.457 s |
| First CAD assembly ready | 3.283 s | 2.130 s |
| Lead TramTrace ready | 4.709 s | 2.645 s |
| All three assemblies ready | 4.709 s | 4.564 s |
| Blocking time before first CAD | 1.284 s | 0.576 s |
| Total time in long tasks | 2.780 s | 2.192 s |
| Longest main-thread task | 1.346 s | 1.495 s |
| Geometry and prepared-lighting transfer, including headers | 3.235 MB | 2.492 MB |

The main board becomes ready about 44% sooner and the first CAD about 35% sooner. All-model readiness improves only slightly: its observed range is 4.361–4.663 s versus 4.131–4.849 s before. The remaining first-render shader work is hardware-dependent; the longest individual task does not improve in this comparison. Geometry alone is 26.8% smaller on the wire, and geometry plus the new lighting asset is about 23% smaller than the previous geometry download. Every run preserves the same groups, meshes and 370,334 triangles and requires the prepared assets and lighting without source fallback.
