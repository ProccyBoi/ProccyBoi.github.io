"""Tessellate the unmodified M2x3 screw in Framework's supplied STEP assembly."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct


SOURCE_SHA256 = "4d44d4fb5606a535271b522be98c48eeee4d1d05a6db9670a6ef7ca95606c3f2"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("assets/models/framework-mechanics"))
    args = parser.parse_args()
    source_hash = hashlib.sha256(args.source.read_bytes()).hexdigest()
    if source_hash != SOURCE_SHA256:
        raise ValueError("The supplied Framework STEP differs from the registered source assembly")

    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.GeomAbs import GeomAbs_Plane
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.STEPControl import STEPControl_Reader
    from OCP.StlAPI import StlAPI_Writer
    from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.gp import gp_Trsf, gp_Vec

    reader = STEPControl_Reader()
    if reader.ReadFile(str(args.source)) != IFSelect_RetDone:
        raise ValueError("The source STEP could not be imported")
    reader.TransferRoots()
    solids = []
    explorer = TopExp_Explorer(reader.OneShape(), TopAbs_SOLID)
    while explorer.More():
        solids.append(TopoDS.Solid_s(explorer.Current()))
        explorer.Next()
    if len(solids) != 4:
        raise ValueError("Expected the reference PCB, housing and two retained screws")
    screw = solids[2]
    seat_planes = []
    explorer = TopExp_Explorer(screw, TopAbs_FACE)
    while explorer.More():
        surface = BRepAdaptor_Surface(TopoDS.Face_s(explorer.Current()))
        if surface.GetType() == GeomAbs_Plane and abs(surface.Plane().Axis().Direction().Y()) > .999:
            seat_planes.append(surface.Plane().Location().Y())
        explorer.Next()
    if not any(abs(height - 3.95) < 1e-6 for height in seat_planes):
        raise ValueError("The M2x3 head bearing plane was not found")
    # Only a rigid translation: the shaft, head and six-lobe drive are original CAD.
    translation = gp_Trsf()
    translation.SetTranslation(gp_Vec(11.3, -3.95, 10.5))
    screw = BRepBuilderAPI_Transform(screw, translation, True).Shape()
    args.output.mkdir(parents=True, exist_ok=True)
    mesh_path = args.output / "framework-m2x3-screw.stl"
    BRepMesh_IncrementalMesh(screw, .02, True, .2, True)
    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(screw, str(mesh_path)):
        raise ValueError("The original fastener could not be tessellated")
    mesh = mesh_path.read_bytes()
    triangles = struct.unpack_from("<I", mesh, 80)[0]
    positions = [struct.unpack_from("<fff", mesh, 84 + index * 50 + 12 + vertex * 12)
                 for index in range(triangles) for vertex in range(3)]
    bounds = [[min(point[axis] for point in positions) for axis in range(3)],
              [max(point[axis] for point in positions) for axis in range(3)]]
    record = {
        "sourceFile": "ExpansionCards-main/Mechanical/Printable/3D/ExpansionCard_SelfTapping.stp",
        "sourceSha256": source_hash,
        "sourceProduct": "STAR_SCREW_M2X3L_298_1",
        "sourceSolidIndex": 2,
        "registrationTranslationMm": [11.3, -3.95, 10.5],
        "coordinateSystem": "Shaft axis +Y; head bearing plane Y=0; tip toward -Y",
        "nominalThread": "M2",
        "nominalLengthMm": 3,
        "headDiameterMm": 3.5,
        "headHeightMm": .8,
        "sourceBoardTopMm": 3.9,
        "sourceBearingPlaneMm": 3.95,
        "boundsMm": bounds,
        "tessellation": {"linearDeflection": .02, "relativeToEdgeSize": True, "angularDeflectionRadians": .2, "triangles": triangles},
        "meshSha256": hashlib.sha256(mesh).hexdigest(),
        "attribution": "Framework Computer Inc, CC BY 4.0. Original screw solid tessellated and rigidly registered without reshaping.",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "rebuild": "python scripts/extract-framework-fastener.py --source <ExpansionCard_SelfTapping.stp>",
    }
    (args.output / "framework-m2x3-screw.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"triangles": triangles, "bytes": len(mesh), "boundsMm": bounds}), flush=True)


if __name__ == "__main__":
    main()
