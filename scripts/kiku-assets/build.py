"""Publish Kiku-owned CAD renders and exact P2 print geometry for the website.

Requires Python 3, Pillow, numpy and trimesh. Run from any directory:
  python scripts/kiku-assets/build.py --source-root "D:/.../Walkman - Blobject"

This deliberately reads an allowlist, never a recursive copy of reference CAD.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
import trimesh


SITE = Path(__file__).resolve().parents[2]
IMAGES = SITE / "assets/images/kiku"
MODELS = SITE / "assets/models/kiku"

# top=110 removes the existing title band, without repainting or synthesising
# pixels. Full labelled diagrams retain all qualification notes and legends.
IMAGE_SPECS = [
    ("hero", "Mechanical/review/P2_assembled_iso.png", 110, 1600,
     "CAD rendering of the Mame P2 enclosure with ivory front, green rear, orange key and upward antenna envelope."),
    ("desk", "Mechanical/review/P2_on_desk.png", 110, 1600,
     "Mame P2 CAD assembly supported by the deployed stand; desk angle is a geometric calculation, not a measured stability result."),
    ("exploded", "Mechanical/review/P2_exploded.png", 110, 1800,
     "P2 CAD exploded assembly, showing the project-designed enclosure and simplified hardware reference envelopes."),
    ("stand", "Mechanical/review/P2_stand_open.png", 110, 1600,
     "Rear view of P2 with its open U-frame stand and unobstructed speaker grille."),
    ("stand-side", "Mechanical/review/P2_stand_side.png", 110, 1600,
     "P2 side elevation showing the deployed 45-degree stand and external hinge mounts."),
    ("display-section", "Mechanical/review/P2_section_display.png", 0, 1900,
     "Section of the P2 display cradle and flex-route study; actual contact engagement remains unverified."),
    ("battery-section", "Mechanical/review/P2_section_battery.png", 0, 1900,
     "P2 battery section showing the 45mm clear pocket, removable guard and nominal reference cell."),
    ("display-assembly", "Mechanical/review/P2_screen_assembly_guide.png", 0, 1800,
     "Project-authored P2 display assembly guide with the broad flex-tail U-fold and outstanding fit checks."),
    ("display-connection", "Mechanical/review/P2_display_connection.png", 110, 1600,
     "Transparent P2 housing view showing display support and the unverified orange flex route."),
    ("battery-cable", "Mechanical/review/P2_battery_and_cable.png", 110, 1600,
     "P2 rear-shell CAD view with the enlarged battery pocket, removable guard and routed antenna coax envelope."),
    ("concepts", "Mechanical/concepts/three_concepts.png", 0, 1900,
     "Mame, Nagare and Mini exterior studies using the same PCB and control datums; these are form studies rather than three completed mechanisms."),
]

# Colors reproduce Mechanical/scripts/render_p2.py. The presentation explosion
# is separate metadata: vertices stay in the shared, original assembly frame.
PARTS = [
    ("front_shell", "Front shell", "Ivory front housing and bezel", "#d9debf", [0, 0, 47]),
    ("rear_shell", "Rear shell", "Rear housing, antenna recess and speaker grille", "#4a6357", [0, 0, -47]),
    ("button_left", "Primary key", "Orange left key", "#f07d33", [-12, 0, 62]),
    ("button_right", "Secondary key", "Tonal right key", "#ccd1a6", [12, 0, 62]),
    ("encoder_knob", "Encoder knob", "Rotary control with D socket and grub-screw retention", "#335240", [0, -8, 76]),
    ("display_carrier", "Display cradle", "Removable three-sided display support", "#bdc9ab", [0, 0, 26]),
    ("battery_guard", "Battery guard", "Removable guard with open coax guides", "#a1b394", [0, 0, -12]),
    ("speaker_retainer", "Speaker retainer", "Removable ring retaining the speaker rim", "#969e94", [0, -8, -25]),
    ("stand_frame", "Folding stand", "U-frame in its actual folded assembly position", "#385747", [0, 0, -72]),
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def site_path(path: Path) -> str:
    return "/" + path.relative_to(SITE).as_posix()


def prepare_images(source: Path) -> list[dict]:
    IMAGES.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, relative, top, maximum, alt in IMAGE_SPECS:
        original = source / relative
        with Image.open(original) as opened:
            im = opened.convert("RGB")
        original_size = list(im.size)
        crop = [0, top, im.width, im.height]
        im = im.crop(crop)
        im.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        output = IMAGES / f"{name}.webp"
        im.save(output, "WEBP", quality=88, method=6)
        variants = []
        if name in ("hero", "desk", "exploded", "stand"):
            small = im.copy()
            small.thumbnail((800, 800), Image.Resampling.LANCZOS)
            variant = IMAGES / f"{name}-800.webp"
            small.save(variant, "WEBP", quality=86, method=6)
            variants.append({"path": site_path(variant), "width": small.width,
                             "height": small.height, "bytes": variant.stat().st_size})
        entries.append({
            "id": name, "path": site_path(output), "source": relative,
            "source_sha256": sha(original), "output_sha256": sha(output),
            "source_size": original_size, "crop_xyxy": crop,
            "width": im.width, "height": im.height, "bytes": output.stat().st_size,
            "kind": "project-authored CAD rendering or diagram; not a photograph",
            "transformation": "rectangular title-band crop where recorded; resize; WebP compression only",
            "alt": alt, "variants": variants,
        })
    return entries


def prepare_models(source: Path) -> dict:
    MODELS.mkdir(parents=True, exist_ok=True)
    blob = bytearray()
    scene = trimesh.Scene()
    entries = []

    def pack(array: np.ndarray, dtype: str, item_size: int) -> dict:
        data = np.ascontiguousarray(array, dtype=dtype)
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(data.tobytes())
        return {"byteOffset": offset, "byteLength": data.nbytes,
                "count": int(data.size // item_size), "itemSize": item_size,
                "componentType": "FLOAT" if dtype == "<f4" else "UNSIGNED_INT"}

    for part_id, label, description, color, explode in PARTS:
        relative = f"Mechanical/exports/P2/{part_id}.stl"
        original = source / relative
        mesh = trimesh.load_mesh(original, process=True)
        if not isinstance(mesh, trimesh.Trimesh) or not len(mesh.faces):
            raise ValueError(f"No triangle mesh in {relative}")
        # Split only vertex sharing at creases. No surface is moved, removed,
        # simplified or decimated. This retains the CAD tessellation exactly.
        smooth = trimesh.graph.smooth_shade(mesh, angle=np.deg2rad(45), facet_minarea=None)
        positions = np.asarray(smooth.vertices, dtype="<f4")
        normals = np.asarray(smooth.vertex_normals, dtype="<f4")
        indices = np.asarray(smooth.faces, dtype="<u4").reshape(-1)
        assert len(smooth.faces) == len(mesh.faces)
        assert np.all(np.isfinite(positions)) and np.all(np.isfinite(normals))
        assert np.allclose(smooth.bounds, mesh.bounds, atol=1e-6)
        rgb = [int(color[i:i+2], 16) for i in (1, 3, 5)]
        smooth.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
            name=part_id, baseColorFactor=rgb + [255], metallicFactor=0.0,
            roughnessFactor=0.68, doubleSided=False))
        scene.add_geometry(smooth, node_name=part_id, geom_name=part_id,
                           metadata={"label": label, "source": relative, "explode": explode})
        entries.append({
            "id": part_id, "name": label, "description": description,
            "color": color, "roughness": 0.68, "source": relative,
            "source_sha256": sha(original), "triangles": int(len(mesh.faces)),
            "vertices": int(len(positions)), "bounds": mesh.bounds.tolist(),
            "size": mesh.extents.tolist(), "center": mesh.bounds.mean(axis=0).tolist(),
            "assembledPosition": [0, 0, 0], "explode": explode,
            "position": pack(positions, "<f4", 3),
            "normal": pack(normals, "<f4", 3),
            "index": pack(indices, "<u4", 1),
        })
    binary = MODELS / "assembly.bin"
    binary.write_bytes(blob)
    glb = MODELS / "assembly.glb"
    glb.write_bytes(trimesh.exchange.gltf.export_glb(scene, include_normals=True))
    bounds = np.array([item["bounds"] for item in entries])
    minimum = bounds[:, 0].min(axis=0)
    maximum = bounds[:, 1].max(axis=0)
    manifest = {
        "schema": "kiku-assembly-v1", "revision": "Mame P2",
        "units": "millimetres", "coordinateSystem": {"x": "right", "y": "up", "z": "front"},
        "geometry": "Exact nine project-designed rigid print STL tessellations in original assembly coordinates. No component, PCB, battery, antenna, lens, or fastener models included.",
        "status": "CAD prototype. Printed P1 informed this P2 revision; P2 physical fit is not established by these assets.",
        "binary": "assembly.bin", "binaryBytes": len(blob), "binarySha256": sha(binary),
        "glb": "assembly.glb", "glbBytes": glb.stat().st_size, "glbSha256": sha(glb),
        "bounds": [minimum.tolist(), maximum.tolist()], "center": ((minimum + maximum) / 2).tolist(),
        "size": (maximum - minimum).tolist(), "partCount": len(entries),
        "triangles": sum(item["triangles"] for item in entries),
        "explosionNote": "Presentation translations only; interpolate 0..1 times each explode vector. Assembled vertices are never recentered individually.",
        "parts": entries,
    }
    (MODELS / "assembly.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    # Round-trip both public formats to validate offsets, index bounds, and
    # exact per-part coordinate bounds before publishing their manifests.
    for entry in entries:
        pos = entry["position"]
        idx = entry["index"]
        xyz = np.frombuffer(blob, "<f4", pos["count"] * 3, pos["byteOffset"]).reshape(-1, 3)
        faces = np.frombuffer(blob, "<u4", idx["count"], idx["byteOffset"])
        assert int(faces.max()) < len(xyz)
        assert np.allclose([xyz.min(axis=0), xyz.max(axis=0)], entry["bounds"], atol=1e-5)
    loaded = trimesh.load_scene(glb)
    assert len(loaded.geometry) == len(entries)
    assert sum(len(m.faces) for m in loaded.geometry.values()) == manifest["triangles"]
    assert np.allclose(loaded.bounds, manifest["bounds"], atol=1e-5)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    args = parser.parse_args()
    source = args.source_root.resolve()
    images = prepare_images(source)
    model = prepare_models(source)
    ledger = {
        "schema": "kiku-asset-ledger-v1", "revision": "Mame P2",
        "scope": "Allowlisted project-authored mechanical renders and the nine original print-part meshes; no supplier images or downloaded component CAD are copied.",
        "sourceRepository": "Walkman - Blobject / Mechanical",
        "sourceReports": ["Mechanical/P2_DESIGN_REPORT.md", "Mechanical/review/clearance_review_P2.json", "Mechanical/review/P1_INDEPENDENT_REVIEW.md"],
        "images": images,
        "assembly": {"manifest": "/assets/models/kiku/assembly.json", "binary": "/assets/models/kiku/assembly.bin", "glb": "/assets/models/kiku/assembly.glb", "partCount": model["partCount"], "triangles": model["triangles"], "bytes": model["binaryBytes"]},
        "publicFacts": {
            "mainBodyPlanMm": [77.1, 120.9], "mainSkinDepthMm": 33.2,
            "fullFoldedEnvelopeMm": [79.1, 126.7, 56.1],
            "clearBatteryPocketMm": [45, 61], "nominalWallMm": 1.8,
            "printedRigidPartCount": 9, "separateLens": True,
            "standOpeningStopDeg": 45, "calculatedScreenDeskAngleDeg": 60.9,
            "physicalEvidence": "P2 report explicitly builds on printed P1 fit feedback. P2 files are a prototype CAD revision, not evidence of a printed or assembled P2 product.",
        },
        "qualificationNotes": [
            "All enclosure images are CAD renders or CAD-derived diagrams, never photographs.",
            "Mechanical/README.md describes a separate older V8: its dimensions and no-speaker architecture must not be merged with Mame P2.",
            "Geometry verification is nominal CAD checking, not manufacture, strength, stability, acoustics or RF validation.",
            "LCD tail pad and stiffener dimensions differ from connector recommendations; the flex U-fold is an unverified fit study.",
            "The enlarged battery bay does not establish a replacement cell size, capacity, charging performance or runtime.",
            "The antenna rod and hinge are simplified engineering envelopes with some listing-photo estimated dimensions.",
            "The interactive mesh contains only nine owned printed parts. Renders also show simplified component reference envelopes for assembly context.",
            "P2 is narrower than the conservative P1 antenna envelope, but the folded stand adds depth; do not describe the whole device as thinner.",
        ],
        "excludedSources": [
            "Mechanical/reference/ali_antenna supplier photos and cached listing HTML",
            "Manufacturer component drawing PDFs and their raster crops, including P2_display_drawing_upright.png and P2_display_connector_drawing.png",
            "Downloaded 3dmodels component libraries and third-party BM83 bundles",
            "Root .3d_verify_*.jpg KiCad screenshots: component model provenance not established for this publication",
        ],
    }
    ledger_file = SITE / "docs/kiku-asset-ledger.json"
    ledger_file.parent.mkdir(parents=True, exist_ok=True)
    ledger_file.write_text(json.dumps(ledger, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"images": len(images), "imageBytes": sum(x["bytes"] for x in images),
                      "parts": model["partCount"], "triangles": model["triangles"],
                      "binaryBytes": model["binaryBytes"], "glbBytes": model["glbBytes"]}, indent=2))


if __name__ == "__main__":
    main()
