# v3 product presentation

Source baseline: `0730dbf780288d156b6eb894ab89b1381b286b83` (restored v2, tree-identical to `649bc32`).

The new v3 is a copy of that maintained v2 experience, including all 15 catalog projects, engineering evidence, interactive viewers, teaching tools and Book. It does not inherit the prior v3 editorial transformations. `scripts/build-v3-pages.py` generates all 25 interiors; the homepage is authored from the v2 source. Only v3 HTML, new `v3-product` presentation/controller files, and the Book sitemap entry may alter production.

## Visual and navigation direction

- White and pale-gray studio surfaces, restrained blue links, system sans-serif typography and generous object space. The real CAD remains the centerpiece.
- Andrew Chung stays visible in the header. The opening identifies an electrical engineering student at UNSW, with direct Projects and CV routes.
- A persistent Projects link and labelled Menu work at compact widths and on coarse-pointer tablets, including landscape. Desktop retains ordinary inline navigation.
- Scene preview and opening a case are separate actions. The opening has labelled Preview buttons and one explicit Open project link. Framework uses the existing closer-look interaction on desktop and a labelled native Preview card selector on compact/touch devices; its four real project links remain visible and independent.
- Compact case studies use a native On this page selector in the introduction instead of a second sticky touch toolbar. Original anchors, complete evidence and genuine interactive viewers remain.

The hierarchy is inspired by the separation of introduction, highlights and detail on official product pages. There is no Apple branding, borrowed copy or invented engineering claim.

## White product revision

The October 12 revision starts from the approved `45c386e` v3 release. It follows the white product presentation of the official [iMac](https://www.apple.com/imac/), [MacBook Air](https://www.apple.com/macbook-air/) and [iPad Air](https://www.apple.com/ipad-air/) pages: continuous unboxed product space, near-black type, sparse blue actions and measured section headings. The approved navigation, preview/open distinction, content and motion remain.

Hero and Selected Work already render over transparent canvases; their geometry, material, lighting and render paths remain exact. A private aircraft controller/atmosphere pair changes only the scene's floor, fog and backdrop palette plus the contact-shadow opacity to match the light studio. The reviewed light shadow is 0.13 instead of 0.35; map resolution, bias and geometry remain exact. Its hardware materials and source geometry stay unchanged. Four responsive fallback posters are rendered from that same light scene, rather than inverted or background-edited photographs. All existing v2/root/shared assets, including their original dark posters, remain frozen.

## Quality and performance boundaries

Source geometry, models, images, materials, lighting, settled shadow quality, entrance timing and all three owned GPU queues are retained. The two v3 controller copies contain scoped route/control changes, an automatic-proximity transfer-promotion guard and a pinned-scene rotation continuity correction. The correction preserves the previous raw scene position during a width/orientation change without overriding new input, hash navigation or offscreen scrolling. Immutable shared assets are unchanged. Models still prepare through the existing finite, cancelable queue and retain static posters on failure or preference fallback.

Automatic offscreen proximity must not preempt the opening hero's raw transfers. Visible scene entry and explicit navigation retain priority. Direct-aircraft transport coordination still releases unrelated downloads after its required raw bytes finish.

## Validation

- `scripts/verify-v3-product-preservation.py`: frozen root/v2/shared bytes, route counterpart inventory and copied content/viewer/evidence contracts.
- `scripts/build-v3-pages.py --check`: generated interiors and all inherited hooks/scripts/payloads.
- `scripts/audit-v3.py`: local references, route metadata, private-source exclusions and source/model lineage.
- `scripts/verify-v3-product-controls.cjs`: scoped clone delta and renderer/pacing parity, native control state, transport guards.
- `scripts/verify-v3-product-surfaces.cjs`: aircraft surface-only clone delta, preserved model/lighting/queue contracts and scoped light poster paths.
- Browser and screenshot checks are separate. Local source checks do not establish mobile usability, hardware performance or WebGL output quality.

Book tests must mock the booking service. Never create a real meeting during QA.
