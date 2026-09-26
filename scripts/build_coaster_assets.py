"""Build reproducible browser STL assets for the Coaster project.

The script reads the authoritative mechanical/PCB sources from the sibling
``Coaster`` project and writes only source-derived assets beneath
``assets/models/coaster``.  It preserves the STEP coordinate system so every
export shares one assembly frame.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Bnd import Bnd_Box
from OCP.IFSelect import IFSelect_ReturnStatus
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.STEPControl import STEPControl_Reader
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Compound, TopoDS_Shape
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool


WEBSITE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = WEBSITE_ROOT.parent / "Coaster"
OUTPUT_DIR = WEBSITE_ROOT / "assets" / "models" / "coaster"

SOURCE_FILES = {
    "base_step": "Coaster Base.step",
    "lid_step": "Coaster Lid.step",
    "pcb_step": "Coaster.step",
    "pcb_kicad": "Coaster.kicad_pcb",
}

LINEAR_DEFLECTION_MM = 0.08
ANGULAR_DEFLECTION_RAD = 0.18
COMPONENT_LINEAR_DEFLECTION_MM = 0.05
COMPONENT_ANGULAR_DEFLECTION_RAD = 0.12
EXPECTED_LED_COUNT = 24

ASSET_NAMES = {
    "base": "coaster-base.stl",
    "lid": "coaster-lid.stl",
    "pcb_board": "coaster-board.stl",
    "led_ring": "coaster-led-ring.stl",
    "capacitors": "coaster-capacitors.stl",
    "resistors": "coaster-resistors.stl",
    "f1_fuse": "coaster-f1-fuse.stl",
    "d1_diode": "coaster-d1-diode.stl",
    "u2_regulator": "coaster-u2-regulator.stl",
    "u3_mcu": "coaster-u3-mcu.stl",
    "u4_sht4x": "coaster-u4-sht.stl",
    "u1_veml7700": "coaster-u1-veml.stl",
    "u6_level_shifter": "coaster-u6-level.stl",
    "j1_usb_c": "coaster-j1-usbc.stl",
}

LEGACY_ASSET_NAMES = (
    "coaster-support.stl",
    "coaster-j2-swd.stl",
)

SURFACE_ASSET_NAMES = {
    "front_silkscreen": "coaster-f-silkscreen.svg",
    "front_mask_openings": "coaster-f-mask-openings.svg",
    "back_silkscreen": "coaster-b-silkscreen.svg",
    "back_mask_openings": "coaster-b-mask-openings.svg",
}

SURFACE_COLORS = {
    "front_silkscreen": "#f2f1e9",
    "front_mask_openings": "#c99b43",
    "back_silkscreen": "#f2f1e9",
    "back_mask_openings": "#c99b43",
}
SURFACE_SUBSTRATE_COLOR = "#5a4932"
SURFACE_PIXELS_PER_MM = 20

NAMED_COMPONENT_GROUPS = {
    "u3_mcu": "U3",
    "u4_sht4x": "U4",
    "u1_veml7700": "U1",
    "j1_usb_c": "J1",
    "u6_level_shifter": "U6",
}


@dataclass(frozen=True)
class StepComponent:
    ref: str
    product_name: str
    shape: TopoDS_Shape


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def shape_bounds(shape: TopoDS_Shape) -> list[float]:
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box)
    return [round(float(v), 6) for v in box.Get()]


def load_step_shape(path: Path) -> TopoDS_Shape:
    reader = STEPControl_Reader()
    status = reader.ReadFile(str(path))
    if status != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise RuntimeError(f"failed to read STEP file: {path}")
    if reader.TransferRoots() <= 0:
        raise RuntimeError(f"STEP file had no transferable roots: {path}")
    shape = reader.OneShape()
    if shape.IsNull():
        raise RuntimeError(f"STEP file produced a null shape: {path}")
    return shape


def label_name(label: TDF_Label) -> str:
    attribute = TDataStd_Name()
    if label.FindAttribute(TDataStd_Name.GetID_s(), attribute):
        return attribute.Get().ToExtString()
    return ""


def referred_product_name(label: TDF_Label) -> str:
    referred = TDF_Label()
    if XCAFDoc_ShapeTool.GetReferredShape_s(label, referred):
        return label_name(referred)
    return ""


def load_pcb_assembly(path: Path) -> tuple[TDocStd_Document, TopoDS_Shape, list[StepComponent]]:
    document = TDocStd_Document(TCollection_ExtendedString("coaster-assets"))
    XCAFApp_Application.GetApplication_s().NewDocument(
        TCollection_ExtendedString("MDTV-XCAF"), document
    )

    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    status = reader.ReadFile(str(path))
    if status != IFSelect_ReturnStatus.IFSelect_RetDone or not reader.Transfer(document):
        raise RuntimeError(f"failed to read STEP assembly: {path}")

    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = TDF_LabelSequence()
    shape_tool.GetFreeShapes(roots)
    if roots.Length() != 1:
        raise RuntimeError(f"expected one PCB STEP root, found {roots.Length()}")

    root = roots.Value(1)
    root_shape = XCAFDoc_ShapeTool.GetShape_s(root)
    components = TDF_LabelSequence()
    if not XCAFDoc_ShapeTool.GetComponents_s(root, components, False):
        raise RuntimeError("PCB STEP root is not an assembly")

    records: list[StepComponent] = []
    for index in range(1, components.Length() + 1):
        label = components.Value(index)
        shape = XCAFDoc_ShapeTool.GetShape_s(label)
        if shape.IsNull():
            raise RuntimeError(f"null STEP component shape at assembly index {index}")
        records.append(
            StepComponent(
                ref=label_name(label),
                product_name=referred_product_name(label),
                shape=shape,
            )
        )
    return document, root_shape, records


def compound(shapes: list[TopoDS_Shape]) -> TopoDS_Compound:
    if not shapes:
        raise ValueError("cannot build an empty compound")
    builder = BRep_Builder()
    result = TopoDS_Compound()
    builder.MakeCompound(result)
    for shape in shapes:
        builder.Add(result, shape)
    return result


def shape_to_mesh(
    shape: TopoDS_Shape,
    *,
    linear_deflection_mm: float = LINEAR_DEFLECTION_MM,
    angular_deflection_rad: float = ANGULAR_DEFLECTION_RAD,
) -> trimesh.Trimesh:
    mesher = BRepMesh_IncrementalMesh(
        shape,
        linear_deflection_mm,
        False,
        angular_deflection_rad,
        True,
    )
    mesher.Perform()
    if not mesher.IsDone():
        raise RuntimeError("OpenCascade tessellation failed")

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        face = TopoDS.Face_s(explorer.Current())
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(face, location)
        if triangulation is not None:
            offset = len(vertices)
            transform = location.Transformation()
            for node_index in range(1, triangulation.NbNodes() + 1):
                point = triangulation.Node(node_index).Transformed(transform)
                vertices.append((point.X(), point.Y(), point.Z()))
            reversed_face = face.Orientation() == TopAbs_REVERSED
            for triangle_index in range(1, triangulation.NbTriangles() + 1):
                a, b, c = triangulation.Triangle(triangle_index).Get()
                if reversed_face:
                    b, c = c, b
                faces.append((offset + a - 1, offset + b - 1, offset + c - 1))
        explorer.Next()

    if not vertices or not faces:
        raise RuntimeError("shape tessellated to an empty mesh")
    return trimesh.Trimesh(
        vertices=np.asarray(vertices, dtype=np.float64),
        faces=np.asarray(faces, dtype=np.int64),
        process=False,
        validate=False,
    )


def export_binary_stl(
    shape: TopoDS_Shape,
    path: Path,
    *,
    linear_deflection_mm: float = LINEAR_DEFLECTION_MM,
    angular_deflection_rad: float = ANGULAR_DEFLECTION_RAD,
) -> dict[str, object]:
    mesh = shape_to_mesh(
        shape,
        linear_deflection_mm=linear_deflection_mm,
        angular_deflection_rad=angular_deflection_rad,
    )
    payload = trimesh.exchange.stl.export_stl(mesh)
    triangle_count = struct.unpack_from("<I", payload, 80)[0]
    expected_size = 84 + 50 * triangle_count
    if len(payload) != expected_size:
        raise RuntimeError(f"invalid binary STL size for {path.name}")
    path.write_bytes(payload)
    bounds = np.asarray(mesh.bounds, dtype=float).reshape(-1)
    return {
        "file": path.name,
        "sha256": sha256_bytes(payload),
        "size_bytes": len(payload),
        "triangles": int(triangle_count),
        "bounds_mm": [round(float(v), 6) for v in bounds],
    }


def tokenize_sexpr(text: str) -> list[str]:
    return re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', text)


def parse_atom(token: str) -> object:
    if token.startswith('"'):
        return json.loads(token)
    try:
        return float(token) if any(char in token for char in ".eE") else int(token)
    except ValueError:
        return token


def parse_sexpr(text: str) -> list[object]:
    root: list[object] = []
    stack: list[list[object]] = []
    current = root
    for token in tokenize_sexpr(text):
        if token == "(":
            child: list[object] = []
            current.append(child)
            stack.append(current)
            current = child
        elif token == ")":
            if not stack:
                raise ValueError("unbalanced KiCad expression")
            current = stack.pop()
        else:
            current.append(parse_atom(token))
    if stack:
        raise ValueError("unterminated KiCad expression")
    if len(root) != 1 or not isinstance(root[0], list):
        raise ValueError("unexpected KiCad root expression")
    return root[0]


def entries(node: list[object], name: str) -> list[list[object]]:
    return [
        value
        for value in node
        if isinstance(value, list) and value and value[0] == name
    ]


def first_entry(node: list[object], name: str) -> list[object]:
    values = entries(node, name)
    if not values:
        raise ValueError(f"missing KiCad field: {name}")
    return values[0]


def kicad_j2(path: Path) -> dict[str, object]:
    board = parse_sexpr(path.read_text(encoding="utf-8"))
    general = first_entry(board, "general")
    board_thickness = float(first_entry(general, "thickness")[1])

    for footprint in entries(board, "footprint"):
        properties = {
            str(item[1]): str(item[2])
            for item in entries(footprint, "property")
            if len(item) >= 3
        }
        if properties.get("Reference") != "J2":
            continue

        placement = first_entry(footprint, "at")
        origin = (float(placement[1]), float(placement[2]))
        rotation_deg = float(placement[3]) if len(placement) > 3 else 0.0
        pads = []
        for pad in entries(footprint, "pad"):
            at = first_entry(pad, "at")
            size = first_entry(pad, "size")
            drill = first_entry(pad, "drill")
            pads.append(
                {
                    "number": str(pad[1]),
                    "type": str(pad[2]),
                    "shape": str(pad[3]),
                    "at_mm": [float(at[1]), float(at[2])],
                    "size_mm": [float(size[1]), float(size[2])],
                    "drill_mm": float(drill[1]),
                }
            )
        pads.sort(key=lambda item: int(item["number"]))
        return {
            "footprint": str(footprint[1]),
            "origin_mm": [origin[0], origin[1]],
            "rotation_deg": rotation_deg,
            "board_thickness_mm": board_thickness,
            "pads": pads,
        }
    raise ValueError("J2 footprint not found in Coaster.kicad_pcb")


def component_manifest(component: StepComponent) -> dict[str, object]:
    return {
        "ref": component.ref,
        "step_product": component.product_name,
        "bounds_mm": shape_bounds(component.shape),
    }


def package_version(distribution: str) -> str:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def find_kicad_cli() -> Path:
    discovered = shutil.which("kicad-cli")
    if discovered:
        return Path(discovered)
    candidates = [
        Path(r"C:\Program Files\KiCad\9.0\bin\kicad-cli.exe"),
        Path(r"C:\Program Files\KiCad\8.0\bin\kicad-cli.exe"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise RuntimeError("kicad-cli was not found; required for source-derived PCB surface SVGs")


def clean_svg_text(text: str) -> str:
    """Normalise generated SVG text and strip per-line trailing whitespace."""
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in normalized.split("\n")).rstrip() + "\n"


def normalize_plot_svg(
    raw: str,
    *,
    title: str,
    color: str,
    pixel_size: tuple[int, int],
) -> str:
    """Make KiCad's SVG output deterministic and assign the browser surface colour."""
    normalized = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", raw, count=1, flags=re.S)
    normalized = re.sub(
        r'width="[0-9.]+mm"\s+height="[0-9.]+mm"',
        f'width="{pixel_size[0]}px" height="{pixel_size[1]}px"',
        normalized,
        count=1,
    )
    normalized = normalized.replace("#000000", color).replace("#000", color)
    return clean_svg_text(normalized)


def svg_body(svg_text: str) -> str:
    """Return only the drawable content from a KiCad SVG plot."""
    match = re.search(r"<svg\b[^>]*>(.*)</svg>", svg_text, flags=re.S)
    if not match:
        raise RuntimeError("unable to extract KiCad SVG body")
    body = match.group(1)
    body = re.sub(r"<title>.*?</title>", "", body, flags=re.S)
    body = re.sub(r"<desc>.*?</desc>", "", body, flags=re.S)
    return body.strip()


def recolor_svg_body(body: str, color: str) -> str:
    """Recolour KiCad's black-and-white plot geometry without changing opacity."""
    return body.replace("#000000", color).replace("#000", color)


def build_opening_surface_svg(
    *,
    mask_svg: str,
    copper_svg: str,
    title: str,
    pixel_size: tuple[int, int],
    viewbox: list[float],
    copper_color: str,
    substrate_color: str,
) -> str:
    """Compose a physical solder-mask opening texture from exact KiCad plots.

    F.Mask/B.Mask define where solder mask is absent.  The opening is rendered as
    bare laminate first, then exact copper is drawn only where the Cu plot and the
    mask opening overlap.  This prevents copper-clearance regions from being
    incorrectly presented as ENIG/gold.
    """
    mask_body = svg_body(mask_svg)
    copper_body = svg_body(copper_svg)
    mask_white = recolor_svg_body(mask_body, "#ffffff")
    openings_substrate = recolor_svg_body(mask_body, substrate_color)
    copper_gold = recolor_svg_body(copper_body, copper_color)
    x, y, width, height = viewbox
    return clean_svg_text(
        '<?xml version="1.0" standalone="no"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'width="{pixel_size[0]}px" height="{pixel_size[1]}px" '
        f'viewBox="{x:.4f} {y:.4f} {width:.4f} {height:.4f}">\n'
        f'<title>{title}</title>\n'
        '<defs>\n'
        f'<mask id="coaster-mask-openings" maskUnits="userSpaceOnUse" x="{x:.4f}" y="{y:.4f}" width="{width:.4f}" height="{height:.4f}">\n'
        f'{mask_white}\n'
        '</mask>\n'
        '</defs>\n'
        f'{openings_substrate}\n'
        '<g mask="url(#coaster-mask-openings)">\n'
        f'{copper_gold}\n'
        '</g>\n'
        '</svg>\n'
    )


def svg_geometry(svg_text: str) -> tuple[list[float], list[float]]:
    viewbox_match = re.search(
        r'viewBox="([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)\s+([\-0-9.]+)"',
        svg_text,
    )
    size_match = re.search(r'width="([0-9.]+)mm"\s+height="([0-9.]+)mm"', svg_text)
    if not viewbox_match or not size_match:
        raise RuntimeError("unable to read KiCad SVG dimensions")
    return (
        [float(viewbox_match.group(i)) for i in range(1, 5)],
        [float(size_match.group(1)), float(size_match.group(2))],
    )


def largest_edge_circle(svg_text: str) -> list[float]:
    circles = [
        (float(cx), float(cy), float(radius))
        for cx, cy, radius in re.findall(
            r'<circle\s+cx="([\-0-9.]+)"\s+cy="([\-0-9.]+)"\s+r="([\-0-9.]+)"',
            svg_text,
        )
    ]
    if not circles:
        raise RuntimeError("Edge.Cuts SVG did not contain a registration circle")
    cx, cy, radius = max(circles, key=lambda item: item[2])
    return [cx, cy, radius]


def build_surface_assets(pcb_path: Path, board_shape: TopoDS_Shape) -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    """Plot exact front silkscreen and solder-mask openings from KiCad.

    The black board mesh represents the solder-mask field.  F.Mask is plotted as
    the openings in that field (including the HALO mask artwork), then coloured
    as exposed ENIG/copper for the browser.  F.SilkS is plotted separately after
    subtracting solder-mask openings so the two source layers do not overlap.
    """
    kicad_cli = find_kicad_cli()
    with tempfile.TemporaryDirectory(prefix="coaster-surface-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        plot_specs = {
            "front_silkscreen": ("F.SilkS", True),
            "front_mask_openings": ("F.Mask", False),
            "front_copper": ("F.Cu", False),
            "back_silkscreen": ("B.SilkS", True),
            "back_mask_openings": ("B.Mask", False),
            "back_copper": ("B.Cu", False),
            "edge_registration": ("Edge.Cuts", False),
        }
        plotted: dict[str, str] = {}
        for key, (layers, subtract_mask) in plot_specs.items():
            output = temp_dir / f"{key}.svg"
            command = [
                str(kicad_cli),
                "pcb",
                "export",
                "svg",
                str(pcb_path),
                "--output",
                str(output),
                "--layers",
                layers,
                "--black-and-white",
                "--fit-page-to-board",
                "--exclude-drawing-sheet",
                "--mode-single",
            ]
            if subtract_mask:
                command.append("--subtract-soldermask")
            subprocess.run(command, check=True, capture_output=True, text=True)
            plotted[key] = output.read_text(encoding="utf-8")

    viewbox, page_size = svg_geometry(plotted["edge_registration"])
    edge_cx, edge_cy, edge_radius = largest_edge_circle(plotted["edge_registration"])
    board_bounds = shape_bounds(board_shape)
    registration = {
        "svg_viewbox_mm": viewbox,
        "page_size_mm": page_size,
        "board_center_svg_mm": [round(edge_cx, 6), round(edge_cy, 6)],
        "board_radius_mm": round(edge_radius, 6),
        "board_bottom_z_mm": round(float(board_bounds[2]), 6),
        "board_top_z_mm": round(float(board_bounds[5]), 6),
        "texture_pixels_per_mm": SURFACE_PIXELS_PER_MM,
        "mapping": "SVG +X maps STEP +X; SVG +Y maps STEP -Y",
    }

    pixel_size = (
        int(round(page_size[0] * SURFACE_PIXELS_PER_MM)),
        int(round(page_size[1] * SURFACE_PIXELS_PER_MM)),
    )

    surface_assets: dict[str, dict[str, object]] = {}
    for key, filename in SURFACE_ASSET_NAMES.items():
        color = SURFACE_COLORS[key]
        titles = {
            "front_silkscreen": "Coaster front silkscreen",
            "front_mask_openings": "Coaster front solder-mask openings",
            "back_silkscreen": "Coaster back silkscreen",
            "back_mask_openings": "Coaster back solder-mask openings",
        }
        title = titles[key]
        if key.endswith("mask_openings"):
            side = "front" if key.startswith("front") else "back"
            payload_text = build_opening_surface_svg(
                mask_svg=plotted[key],
                copper_svg=plotted[f"{side}_copper"],
                title=title,
                pixel_size=pixel_size,
                viewbox=viewbox,
                copper_color=color,
                substrate_color=SURFACE_SUBSTRATE_COLOR,
            )
        else:
            payload_text = normalize_plot_svg(
                plotted[key],
                title=title,
                color=color,
                pixel_size=pixel_size,
            )
        payload = payload_text.encode("utf-8")
        path = OUTPUT_DIR / filename
        path.write_bytes(payload)
        surface_assets[key] = {
            "file": filename,
            "sha256": sha256_bytes(payload),
            "size_bytes": len(payload),
            "color": color,
            "source_layers": {
                "front_silkscreen": ["F.SilkS", "F.Mask"],
                "front_mask_openings": ["F.Mask", "F.Cu"],
                "back_silkscreen": ["B.SilkS", "B.Mask"],
                "back_mask_openings": ["B.Mask", "B.Cu"],
            }[key],
            "intrinsic_pixels": list(pixel_size),
        }
        if key.endswith("mask_openings"):
            surface_assets[key]["substrate_color"] = SURFACE_SUBSTRATE_COLOR
    return registration, surface_assets


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help="Coaster project root (default: sibling ../Coaster)",
    )
    args = parser.parse_args()
    source_root = args.source_root.resolve()
    source_paths = {key: source_root / name for key, name in SOURCE_FILES.items()}
    missing = [str(path) for path in source_paths.values() if not path.is_file()]
    if missing:
        raise SystemExit("missing source file(s): " + ", ".join(missing))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for legacy_name in LEGACY_ASSET_NAMES:
        legacy_path = OUTPUT_DIR / legacy_name
        if legacy_path.exists():
            legacy_path.unlink()

    base_shape = load_step_shape(source_paths["base_step"])
    lid_shape = load_step_shape(source_paths["lid_step"])
    document, pcb_shape, components = load_pcb_assembly(source_paths["pcb_step"])
    # Keep the XCAF document alive until all component shapes are exported.
    _document_lifetime = document

    by_ref = {component.ref: component for component in components}
    duplicate_refs = sorted(
        ref for ref in by_ref if sum(component.ref == ref for component in components) != 1
    )
    if duplicate_refs:
        raise RuntimeError(f"duplicate STEP refs: {duplicate_refs}")

    led_components = sorted(
        (component for component in components if re.fullmatch(r"LED\d+", component.ref)),
        key=lambda component: int(component.ref[3:]),
    )
    if len(led_components) != EXPECTED_LED_COUNT:
        raise RuntimeError(
            f"expected {EXPECTED_LED_COUNT} STEP LED refs, found {len(led_components)}"
        )

    for ref in NAMED_COMPONENT_GROUPS.values():
        if ref not in by_ref:
            raise RuntimeError(f"required STEP ref missing: {ref}")

    board_candidates = [
        component for component in components if component.product_name == "Coaster_PCB"
    ]
    if len(board_candidates) != 1:
        raise RuntimeError(
            f"expected one Coaster_PCB STEP occurrence, found {len(board_candidates)}"
        )
    board_component = board_candidates[0]

    j2 = kicad_j2(source_paths["pcb_kicad"])
    if len(j2["pads"]) != 4:
        raise RuntimeError(f"expected four J2 pads, found {len(j2['pads'])}")

    capacitor_components = sorted(
        (component for component in components if re.fullmatch(r"C\d+", component.ref)),
        key=lambda component: int(component.ref[1:]),
    )
    resistor_components = sorted(
        (component for component in components if re.fullmatch(r"R\d+", component.ref)),
        key=lambda component: int(component.ref[1:]),
    )
    if not capacitor_components or not resistor_components:
        raise RuntimeError("expected source STEP capacitor and resistor groups")
    for ref in ("F1", "D1", "U2"):
        if ref not in by_ref:
            raise RuntimeError(f"required detailed STEP ref missing: {ref}")

    consumed_refs = {component.ref for component in led_components}
    consumed_refs.update(component.ref for component in capacitor_components)
    consumed_refs.update(component.ref for component in resistor_components)
    consumed_refs.update(NAMED_COMPONENT_GROUPS.values())
    consumed_refs.update({"F1", "D1", "U2", board_component.ref})
    unexpected_refs = sorted(
        component.ref for component in components if component.ref not in consumed_refs
    )
    if unexpected_refs:
        raise RuntimeError(
            "unclassified STEP component refs: " + ", ".join(unexpected_refs)
        )

    asset_shapes: dict[str, TopoDS_Shape] = {
        "base": base_shape,
        "lid": lid_shape,
        "pcb_board": board_component.shape,
        "led_ring": compound([component.shape for component in led_components]),
        "capacitors": compound([component.shape for component in capacitor_components]),
        "resistors": compound([component.shape for component in resistor_components]),
        "f1_fuse": by_ref["F1"].shape,
        "d1_diode": by_ref["D1"].shape,
        "u2_regulator": by_ref["U2"].shape,
    }
    for group, ref in NAMED_COMPONENT_GROUPS.items():
        asset_shapes[group] = by_ref[ref].shape

    assets: dict[str, dict[str, object]] = {}
    for group in ASSET_NAMES:
        path = OUTPUT_DIR / ASSET_NAMES[group]
        high_detail = group not in {"base", "lid", "pcb_board", "led_ring", "j1_usb_c"}
        assets[group] = export_binary_stl(
            asset_shapes[group],
            path,
            linear_deflection_mm=(
                COMPONENT_LINEAR_DEFLECTION_MM if high_detail else LINEAR_DEFLECTION_MM
            ),
            angular_deflection_rad=(
                COMPONENT_ANGULAR_DEFLECTION_RAD if high_detail else ANGULAR_DEFLECTION_RAD
            ),
        )

    surface_registration, surface_assets = build_surface_assets(
        source_paths["pcb_kicad"], board_component.shape
    )

    source_manifest = {
        key: {
            "file": path.name,
            "sha256": sha256_file(path),
            "size_bytes": path.stat().st_size,
        }
        for key, path in source_paths.items()
    }

    group_manifest = {
        "base": {
            "asset": ASSET_NAMES["base"],
            "sources": ["base_step"],
            "refs": [],
        },
        "lid": {
            "asset": ASSET_NAMES["lid"],
            "sources": ["lid_step"],
            "refs": [],
        },
        "pcb_board": {
            "asset": ASSET_NAMES["pcb_board"],
            "sources": ["pcb_step"],
            "refs": [board_component.ref],
            "step_product": board_component.product_name,
        },
        "led_ring": {
            "asset": ASSET_NAMES["led_ring"],
            "sources": ["pcb_step"],
            "refs": [component.ref for component in led_components],
        },
        "capacitors": {
            "asset": ASSET_NAMES["capacitors"],
            "sources": ["pcb_step"],
            "refs": [component.ref for component in capacitor_components],
        },
        "resistors": {
            "asset": ASSET_NAMES["resistors"],
            "sources": ["pcb_step"],
            "refs": [component.ref for component in resistor_components],
        },
        "f1_fuse": {
            "asset": ASSET_NAMES["f1_fuse"],
            "sources": ["pcb_step"],
            "refs": ["F1"],
            "step_product": by_ref["F1"].product_name,
        },
        "d1_diode": {
            "asset": ASSET_NAMES["d1_diode"],
            "sources": ["pcb_step"],
            "refs": ["D1"],
            "step_product": by_ref["D1"].product_name,
        },
        "u2_regulator": {
            "asset": ASSET_NAMES["u2_regulator"],
            "sources": ["pcb_step"],
            "refs": ["U2"],
            "step_product": by_ref["U2"].product_name,
        },
    }
    for group, ref in NAMED_COMPONENT_GROUPS.items():
        group_manifest[group] = {
            "asset": ASSET_NAMES[group],
            "sources": ["pcb_step"],
            "refs": [ref],
            "step_product": by_ref[ref].product_name,
        }

    manifest = {
        "schema_version": 1,
        "units": "millimetres",
        "coordinate_system": {
            "basis": "native STEP assembly coordinates",
            "kicad_mapping": "STEP X = KiCad X; STEP Y = -KiCad Y",
        },
        "generator": {
            "script": "scripts/build_coaster_assets.py",
            "linear_deflection_mm": LINEAR_DEFLECTION_MM,
            "angular_deflection_rad": ANGULAR_DEFLECTION_RAD,
            "component_linear_deflection_mm": COMPONENT_LINEAR_DEFLECTION_MM,
            "component_angular_deflection_rad": COMPONENT_ANGULAR_DEFLECTION_RAD,
            "python_packages": {
                "cadquery": package_version("cadquery"),
                "cadquery-ocp": package_version("cadquery-ocp"),
                "trimesh": package_version("trimesh"),
            },
        },
        "sources": source_manifest,
        "assets": assets,
        "surface_assets": surface_assets,
        "surface_registration": surface_registration,
        "groups": group_manifest,
        "board_features": {
            "j2_swd": {
                "sources": ["pcb_kicad"],
                "refs": ["J2"],
                "rendering": (
                    "Exact plated targets, drills and mask clearances are carried by the "
                    "KiCad-derived board surface textures. J2 has no fitted STEP component "
                    "and therefore does not explode away from the PCB."
                ),
                "kicad": j2,
            }
        },
        "pcb_step_components": [component_manifest(component) for component in components],
        "uncertainties": [
            "The KiCad-exported board occurrence is named '=>[0:1:1:13]' in Coaster.step; it is assigned to pcb_board by its STEP product name 'Coaster_PCB'.",
            "J2 is a four-pad pogo/SWD footprint with no 3D occurrence in Coaster.step. It is intentionally not exported as a separate 3D component: its exact plated targets, drills and mask clearances remain part of the source-derived PCB surfaces and stay attached to the board during explode.",
            "Capacitors, resistors, F1, D1 and U2 are exported as separate source-STEP groups rather than one generic support-component mesh so their package geometry and material treatment remain visually distinct.",
            f"Small IC/passive component meshes use a finer {COMPONENT_LINEAR_DEFLECTION_MM:.3f} mm / {COMPONENT_ANGULAR_DEFLECTION_RAD:.3f} rad tessellation than the enclosure/board meshes to retain small package detail.",
            "Coaster.kicad_pcb does not encode a solder-mask colour. The black solder-mask field is the specified manufacturing/product finish; the KiCad-derived SVGs provide the exact mask-opening and silkscreen geometry.",
            f"The mask-opening surface textures intersect exact F.Mask/B.Mask geometry with F.Cu/B.Cu. Copper-backed openings are visualised as {SURFACE_COLORS['front_mask_openings']} and copper-clearance openings as representative laminate {SURFACE_SUBSTRATE_COLOR}; these display colours are not encoded in the KiCad file.",
        ],
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(
        f"Wrote {len(assets)} binary STL assets, {len(surface_assets)} PCB surface SVGs and "
        f"{manifest_path.relative_to(WEBSITE_ROOT)}"
    )
    for group in ASSET_NAMES:
        info = assets[group]
        print(
            f"{info['file']}: {info['triangles']} triangles, {info['size_bytes']} bytes, {info['sha256']}"
        )
    for key in SURFACE_ASSET_NAMES:
        info = surface_assets[key]
        print(f"{info['file']}: {info['size_bytes']} bytes, {info['sha256']}")


if __name__ == "__main__":
    main()
