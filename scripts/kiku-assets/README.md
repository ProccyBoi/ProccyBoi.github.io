# Kiku mechanical assets

`build.py` publishes an explicit allowlist of the project's Mame P2 CAD renders
and its nine rigid printed parts. It does not copy supplier photos or component
CAD. Dependencies: Python 3, Pillow, numpy and trimesh.

```powershell
python scripts/kiku-assets/build.py --source-root "D:\Electronics Projects\Walkman - Blobject"
```

The source image checksums, exact rectangular crops, dimensions, captions and
prototype qualifications are recorded in `docs/kiku-asset-ledger.json`.

`assets/models/kiku/assembly.json` describes the single little-endian
`assembly.bin` file. Each part has `position`, `normal` and `index` records:

- `byteOffset` and `byteLength` refer to the binary file.
- `count` is the number of vectors for position/normal, or scalar indices.
- `itemSize` is three for position/normal and one for index.
- `componentType` is `FLOAT` (Float32Array) or `UNSIGNED_INT` (Uint32Array).

All offsets are aligned to four bytes. Build a Three.js BufferGeometry from
these views, then a MeshStandardMaterial using `color` and `roughness`.
Vertices retain the actual millimetre assembly coordinate frame: X right,
Y up, Z toward the front. Translate the common parent by negative `center`
if useful; do not separately recenter each part. Animate each mesh position
to `explode` times a common slider value. These explosion vectors are solely
presentation offsets. They do not change assembly geometry.

The optional `assembly.glb` contains the same nine named meshes with materials
and normals in millimetres. It is intentionally not automatically scaled to
metres. All triangle faces are retained; only shared vertices are split at
45-degree creases for shading. The builder validates binary index ranges,
per-part bounds, and GLB round-trip bounds, part and triangle counts.

The browser assembly intentionally excludes hardware reference envelopes and
the separate lens. It is a nine-part enclosure explorer, not a complete
electrical/mechanical digital twin. Printed P1 fit feedback informed P2; the
assets do not establish physical P2 fit or performance.
