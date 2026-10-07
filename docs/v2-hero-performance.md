# Hero geometry and loading

The homepage loads prepared versions of the existing TramTrace, Skylabs telemetry and Pi assemblies. Source CAD files, standalone viewers, photography, poster resolution, render pixel ratio and SVG texture resolution remain unchanged.

The build runs the existing factories once and records their final geometry, materials, scene hierarchy, physical references and motion origins. Vertices may share an index only when all their attribute bytes match. No triangle is removed, no coordinates are quantized and no normal, UV or colour data is approximated. Material colours are stored as linear RGB values rather than rounded hex colours.

The hero downloads these prepared assets alongside Three.js, directly creates their renderable buffers and loads the original silkscreens. It no longer needs GLTFLoader or the two source factories on a successful normal visit. A failed prepared asset uses the corresponding source factory; a failed source keeps that project's moving poster. Reduced motion and Save Data retain the static composition without downloading either set of models.

Packs ship as explicit `.idx.bin.gz` files, decoded with the browser's native `DecompressionStream`. This keeps delivery compressed regardless of the host's MIME policy. Before compression, each triangle-index array is rearranged into byte lanes; the browser reverses that arrangement into the exact original bytes. Vertices, triangle order and material data do not change. The current three files total 2,541,070 bytes, including the Pi housing and mounting screws. Decoding yields between bounded chunks when its work exceeds an 8 ms budget.

Browsers without native decompression use the identical `.bin` data. The preceding `.bin.gz` files remain available for cached older loaders. New filenames and a versioned loader URL prevent a cached old script from receiving the new transport format.

## Immediate interaction

`assets/v2-hero-loading.js` and `.css` start independently of Three.js. A lightweight 2D field uses colours and positions sampled from the original board posters, with a diagonal light sweep following each board's alpha silhouette. Moving over a board lifts the field and opens a soft magnifying lens onto its full-resolution image; a tap briefly inspects that area and sends a radial pulse through the nearby samples. The lens never substitutes fabricated component detail.

The heading, project links, native scrolling and original posters remain available throughout. Each finished CAD assembly appears immediately, with its own short field fade; there is no minimum loading duration or invented progress percentage. Loading animation pauses offscreen, in a hidden tab, under reduced motion or Save Data, and stops after all models have either appeared or failed. Pointer and touch handling is passive and does not capture scrolling.

The light sweep uses small cached alpha masks on the same 2D canvas. The field and its small lens buffers request CPU backing, avoiding promoted CSS mask layers competing with WebGL startup. Original posters and the magnifying lens retain their full resolution. Canvas paints are capped at 30 per second.

## Prepared lighting

The product studio PMREM environment is baked into a 164,981-byte compressed asset. All 768×768 native RGBE texels, their encoding, filtering and layout are preserved. `scripts/build-v2-hero-environment.cjs` uses the same studio function as runtime recovery and compares the fresh and prepared environment across all three complete CAD models in both assembled and exploded poses; all six comparisons produced zero changed pixel channels. `--verify` checks an existing build. The environment metadata records the shared studio helper hash as well as the baker and Three.js hashes.

The geometry files and lighting download together while Three.js starts. The original SVG silkscreens begin fetching alongside their geometry, removing the previous dependency on a fully downloaded and decoded pack. Their Image objects are reused at full resolution when textures are constructed; the pack's texture properties remain authoritative.

The homepage's small async `v2-hero-startup.js` queues the unchanged Three.js and motion runtime before CAD resources compete for the connection. It then starts the geometry and lighting helpers. The scene uses the same script promises if it initializes first or while these requests are in flight. Failed early requests can be retried by normal scene initialization. This work never gates the poster scene, native page scrolling, or navigation. Both the early startup and scene retain the reduced-motion and Save Data guards.

## Rebuilding

Serve the repository root, then run `node scripts/build-v2-hero-assets.cjs`. `V2_BASE_URL` defaults to `http://127.0.0.1:8080`; `CHROMIUM_EXECUTABLE` can select an existing Chromium installation, and the Node environment needs Playwright. The build uses a blank same-origin page, evaluates the original factories and verifies the actual reconstructed pack objects against them. `--verify` repeats this comparison without replacing the generated assets.

`assets/models/hero/manifest.json` records the source hashes, pack hashes, triangle counts and parity fingerprints. Expanded triangle attributes are compared byte for byte; material properties, texture URLs/settings, transforms and component metadata are compared structurally. Text source hashes normalize CRLF to LF so Windows and Linux agree. The site audit checks source freshness, generated file hashes and that each gzip file decompresses to its exact plain counterpart before deployment.

`node scripts/render-product-posters.cjs` renders the same complete CAD and studio into transparent 1600×1200 poster candidates. It writes a native PNG reference and a WebP encoded at quality 88 with lossless alpha, checking the decoded alpha bytes exactly. `PRODUCT_POSTER_OUT` selects the candidate directory; the script never replaces production images itself. The three current candidates total 358,572 bytes. They preserve fine component edges and the clear enclosure in Chromium; stepped white edges shown by one transparent-WebP preview tool were absent from both the native PNG and actual browser composition, with zero decoded alpha differences. No supersampling or lower resolution was required.

| Assembly | Physical groups | Meshes | Triangles |
| --- | ---: | ---: | ---: |
| TramTrace | 31 | 104 | 96,514 |
| Telemetry | 54 | 166 | 224,256 |
| Raspberry Pi | 36 | 90 | 59,762 |

The table counts unique geometry buffers, matching the manifest. The Pi's two screws share one 5,716-triangle buffer, so traversing all mesh instances reports 65,478 Pi triangles. Across the three models this is 380,532 unique triangles or 386,248 mesh-instance triangles. Indexing only combines vertices whose complete attributes are identical.

## Lighting and motion

The product studio uses a dark room with three shaped softboxes, a warm directional key, restrained fill and a rear rim. The key's single 2048-pixel shadow map follows the visible assemblies, including the opening composition. This gives components contact and self shadows without adding another render target or shadow pass per project. Shadow maps update only during an actual scene render; the hero stops rendering when settled, offscreen or hidden.

The finish is applied after loading an unchanged prepared pack or its source fallback. Original geometry, component transforms, colours, texture objects, opacity and alpha settings remain intact. Known soldermask and housing materials use physical clearcoat; metal and plastic retain distinct roughness and reflection response. The old Three.js release requires restoring the `PHYSICAL` shader define when copying a standard material into a physical one. No generated grain or replacement texture is downloaded.

Only the thin soldermask coating stops casting shadows. The exported coating is coplanar with the physical board, and rendering it as another solid shadow caster incorrectly blackens the whole PCB. The mask still receives shadows from the components; PCB core, pads, pins, packages and screws keep their original casting behavior. The clear Pi housing and silkscreen already do not cast opaque shadows. Isolated diagnostic renders confirmed that the fault was coating self-occlusion, not the housing or a neighbouring project; changing global shadow bias did not solve it.

`V2ProductStudio` is exported by the already-loaded `v2-hero-environment.js`, adding no startup dependency request. Other CAD scenes can call `configureRenderer(renderer, THREE)`, `createLights(THREE, scene)` (returns the shadow-casting `key`), and `applyMaterials(model, name, THREE)`. `V2HeroEnvironment.load(THREE)` returns the prepared texture; `V2ProductStudio.createEnvironment(THREE, renderer)` returns the matching live PMREM target for recovery. Each scene fits its key shadow camera to its own visible geometry. Applying the finish twice is safe.

Hero motion has separate lift-off, spread, rotation and settling phases. Components use family and spatial stagger, restrained curved paths and independently timed tilts. Original exploded positions are retained; intermediate lateral deviation is bounded to 0.012 board spans. Reversing the scroll reconstructs the same pose, and returning to zero restores each original component position and quaternion exactly.

## Verification and measurement

- `node scripts/verify-v2-hero-startup.cjs` checks pre-WebGL pointer/touch interaction, actual magnification, mobile scrolling and links, per-model handoff, animation suspension, motion preferences and prepared-lighting recovery.
- `node scripts/verify-v2-hero-prefetch.cjs` checks exact texture URL parity with committed pack headers, texture requests while geometry is blocked, shared downloads, failed-helper retry, and reduced-motion/Save Data suppression without a browser.
- `node scripts/verify-v2-product-studio.cjs` loads the real prepared CAD without a GPU and checks byte-identical vertex/index data, exact transforms, source colours/maps/alpha, housing and screws, physical shader activation, and the intentional soldermask-only shadow-casting exception.
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

## Parallel startup, 7 October 2026

An isolated copy of committed `9bb87f1` was compared with the startup-only changes, keeping its original theme and layout. The same cold-cache 10 Mbps / 40 ms fixture and software renderer above were used for three runs per version. A second baseline set was then run to check host variability. Reports are in `.codex-temp/hero-startup-20261007/`; `before.json`, `before-repeat.json` and `after-priority.json` contain the retained comparison. Medians:

| Measurement | Baseline | Repeated baseline | Parallel startup |
| --- | ---: | ---: | ---: |
| Lead poster eligible for paint | 0.304 s | 0.295 s | 0.289 s |
| Loading interaction starts | 0.397 s | 0.385 s | 0.379 s |
| First CAD assembly ready | 2.678 s | 2.778 s | 2.763 s |
| Lead TramTrace ready | 2.741 s | 2.844 s | 2.838 s |
| All three assemblies ready | 5.597 s | 5.966 s | 4.002 s |

All-model readiness improved in these runs, while first-CAD readiness remained around 2.7 seconds. Individual all-model times varied from 4.239–6.007 seconds for the six baseline runs and 3.882–5.972 seconds for the three final runs; do not present the median improvement as a guaranteed device-level speedup. The image dependency waterfall is removed, but shader work remains hardware-dependent. Each run retains exactly the same geometry counts, 2,666,556 transferred CAD/environment bytes including response headers, original textures, lighting, and 363 overview draw calls. No pack, material, mesh, shadow setting or texture resolution changed.

## Product studio and matching posters, 7 October 2026

The finished studio was compared with committed `81fe1c8` using the same 1440×1000 viewport, cold cache, 10 Mbps / 40 ms network fixture and Chromium SwiftShader renderer. Three-run reports are retained in `.codex-temp/product-performance/before.json`, `before-repeat.json`, `after.json` and `after-final.json`. The final set includes the corrected shadow bias and regenerated posters. The first baseline run had an approximately five-second startup stall: its lead poster was eligible at 5.099 seconds and first CAD at 7.611 seconds. That result remains in the original report and the first baseline column below. A complete second baseline set was captured to check variability. Values are medians:

| Measurement | Initial `81fe1c8` baseline | Repeated `81fe1c8` baseline | Product studio |
| --- | ---: | ---: | ---: |
| Lead poster eligible for paint | 0.284 s | 0.244 s | 0.234 s |
| Loading interaction starts | 0.498 s | 0.482 s | 0.353 s |
| First CAD assembly ready | 2.872 s | 2.644 s | 2.686 s |
| Lead TramTrace ready | 2.989 s | 2.735 s | 2.767 s |
| All three assemblies ready | 6.037 s | 4.050 s | 3.977 s |
| CAD and lighting transfer, including headers | 2,666,556 B | 2,666,556 B | 2,706,820 B |

The final first-CAD result is comparable to the repeated baseline: 0.042 seconds slower at the median, with TramTrace 0.032 seconds slower. First-CAD times ranged from 2.561–2.697 seconds in the repeated baseline and 2.678–2.767 seconds in the final studio. All-model timings remain variable: 3.980–4.245 seconds before and 3.961–5.701 seconds after, so the slightly lower final median is not evidence of a reliable speedup. The intermediate studio set had a 2.993-second first-CAD median; it remains in `after.json` and must not be silently substituted for the final set or used to attribute improvements solely to the bias correction. These are software-renderer measurements on one host, not guaranteed device timings. Immediate poster interaction and native scrolling remain available before CAD readiness.

Every run retained 121 physical groups, 360 meshes, 386,248 mesh-instance triangles and 363 overview draw calls. The three geometry packs are unchanged. The prepared environment grows by 40,264 bytes, from 124,717 to 164,981 bytes. The final quality-88 posters total 347,352 bytes versus the previous 263,768 bytes, an additional 83,584 bytes; their 1600×1200 resolution is unchanged. These two asset changes add 123,848 bytes before response headers. The posters' decoded alpha matches the native PNG references byte for byte for all three boards, both in the offline encoder check and actual Chromium canvas decoding. Browser image comparisons show clean silhouettes and translucent housing edges without the stepped fringe seen in a preview tool. A scale-matched shadow bias removes diagonal self-shadow bands from broad board and shield surfaces while retaining component contact shadows; no caster geometry is removed for this correction.
