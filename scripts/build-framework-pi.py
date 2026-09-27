"""Export the Raspberry Pi expansion card without modifying the electronics project.

Requires KiCad 9 and the STEP companions of the models referenced by the board.
The local project path is supplied explicitly; it is not embedded in published assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import struct
import tempfile


SWITCH_MODEL = "SW-SMD_L4.7-W3.5-H1.9-P3.35-EH.wrl"
# The WRL is registered to the footprint; its STEP companion has a corner
# origin. Apply this rigid registration only to the temporary export board.
SWITCH_STEP_OFFSET_MM = [2.35, 1.2339, -0.050313]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_sexpr(text: str) -> list:
    stack: list[list] = []
    root: list = []
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', text):
        if token == "(":
            node: list = []
            if stack:
                stack[-1].append(node)
            else:
                root = node
            stack.append(node)
        elif token == ")":
            stack.pop()
        else:
            stack[-1].append(token[1:-1] if token.startswith('"') else token)
    return root


def child(node: list, key: str) -> list | None:
    return next((part for part in node if isinstance(part, list) and part[0] == key), None)


def verify_switch_registration(path: Path, tree: list) -> dict:
    """Check exported terminal geometry against the unchanged PCB land pattern."""
    data = path.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary_start = 28 + json_length
    source = {}
    for footprint in tree:
        if not isinstance(footprint, list) or footprint[0] != "footprint":
            continue
        props = {item[1]: item[2] for item in footprint if isinstance(item, list) and item[0] == "property"}
        if props.get("Reference") in {"SW1", "SW2"}:
            source[props["Reference"]] = footprint
    checks = {}
    for node in document["nodes"]:
        reference = node.get("name")
        if reference not in source:
            continue
        x, y, z, w = node["rotation"]
        rotation = ((1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w)),
                    (2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w)),
                    (2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y)))
        vertices = []
        for primitive in document["meshes"][node["mesh"]]["primitives"]:
            accessor = document["accessors"][primitive["attributes"]["POSITION"]]
            view = document["bufferViews"][accessor["bufferView"]]
            assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
            start = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            for index in range(accessor["count"]):
                point = struct.unpack_from("<3f", data, start + index*view.get("byteStride", 12))
                vertices.append(tuple(1000*(sum(rotation[axis][k]*point[k] for k in range(3)) + node["translation"][axis]) for axis in range(3)))
        footprint = source[reference]
        fx, fy, angle = map(float, child(footprint, "at")[1:])
        if angle != 180:
            raise ValueError(f"Review {reference}'s changed actuator orientation before export.")
        centre_error = abs((min(p[0] for p in vertices) + max(p[0] for p in vertices))/2 - fx)
        outward = max(p[2] for p in vertices) - fy
        contacts = [p for p in vertices if .70 < p[1] < .83]
        pad_coverage = {}
        for pad in footprint:
            if not isinstance(pad, list) or pad[0] != "pad" or not pad[1]:
                continue
            px, py = map(float, child(pad, "at")[1:3])
            width, height = map(float, child(pad, "size")[1:3])
            count = sum(abs(p[0] - (fx-px)) <= width/2 and abs(p[2] - (fy-py)) <= height/2 for p in contacts)
            if count < 2:
                raise ValueError(f"{reference} terminal does not overlap source pad {pad[1]}.")
            pad_coverage[pad[1]] = count
        if centre_error > .001 or not math.isclose(outward, 2.4339, abs_tol=.001):
            raise ValueError(f"{reference} is not centred or its actuator faces away from the card edge.")
        checks[reference] = {"centreErrorMm": centre_error, "outwardActuatorMm": outward,
                             "terminalVerticesWithinPads": pad_coverage}
    if set(checks) != {"SW1", "SW2"}:
        raise ValueError("The exported board is missing a switch.")
    return checks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path, help="The Framework Expansion Card - Raspberry Pi project directory")
    parser.add_argument("--kicad-cli", default="kicad-cli")
    parser.add_argument("--custom-models", type=Path, help="Optional relocated easyeda2kicad.3dshapes directory")
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[1]
    source = args.source_root.resolve()
    board_rel = "ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb"
    shell_rel = "ExpansionCards-main/Mechanical/Printable/3D/ExpansionCard_ThreadedInsert.stl"
    board = source / board_rel
    shell = source / shell_rel
    originals = {path: sha256(path) for path in (board, shell)}
    output = repository / "assets/models/framework-pi"
    output.mkdir(parents=True, exist_ok=True)
    text = board.read_text(encoding="utf-8")
    tree = parse_sexpr(text)
    footprints = []
    for part in tree:
        if not isinstance(part, list) or part[0] != "footprint":
            continue
        props = {item[1]: item[2] for item in part if isinstance(item, list) and item[0] == "property"}
        at = child(part, "at") or ["at", "0", "0"]
        footprints.append({"ref": props.get("Reference"), "value": props.get("Value"), "footprint": part[1], "atMm": [float(v) for v in at[1:]], "hasModel": child(part, "model") is not None})
    if not any(item["value"] == "RP2354B_C39843328" for item in footprints):
        raise ValueError("The selected board is not the RP2354B design. The legacy Microcontroller folder contains an unrelated SAMD21 board.")

    switches = []
    for part in tree:
        if not isinstance(part, list) or part[0] != "footprint":
            continue
        props = {item[1]: item[2] for item in part if isinstance(item, list) and item[0] == "property"}
        if props.get("Reference") not in {"SW1", "SW2"}:
            continue
        model = child(part, "model")
        if not model or Path(model[1]).name != SWITCH_MODEL:
            raise ValueError("The switch model changed; its STEP registration must be reviewed.")
        for key, expected in (("offset", [0., 0., 0.]), ("rotate", [0., 0., 0.]), ("scale", [1., 1., 1.])):
            values = child(child(model, key) or [], "xyz")
            if not values or [float(value) for value in values[1:]] != expected:
                raise ValueError(f"{props['Reference']} has a new {key}; review the STEP registration before exporting.")
        model_path = args.custom_models / SWITCH_MODEL if args.custom_models else Path(model[1])
        originals[model_path] = sha256(model_path)
        originals[model_path.with_suffix(".step")] = sha256(model_path.with_suffix(".step"))
        switches.append({"reference": props["Reference"], "model": SWITCH_MODEL,
                         "stepOffsetMm": SWITCH_STEP_OFFSET_MM,
                         "wrlSha256": sha256(model_path), "stepSha256": sha256(model_path.with_suffix(".step"))})
    if {item["reference"] for item in switches} != {"SW1", "SW2"}:
        raise ValueError("Both expected tactile switches are required.")

    with tempfile.TemporaryDirectory(prefix="framework-pi-export-") as directory:
        export_board = Path(directory) / "Expansion_Card.kicad_pcb"
        export_text = text
        if args.custom_models:
            def relocate(match: re.Match) -> str:
                original = match.group(1)
                if "easyeda2kicad.3dshapes/" not in original:
                    return match.group(0)
                model = args.custom_models.resolve() / Path(original).name
                if not model.is_file() or not model.with_suffix(".step").is_file():
                    raise FileNotFoundError(f"The original model and STEP companion are required: {model.name}")
                return '(model "' + model.as_posix() + '"'
            export_text = re.sub(r'\(model "([^"]+)"', relocate, export_text)
        switch_pattern = (r'(\(model\s+"[^\"]*/' + re.escape(SWITCH_MODEL)
                          + r'"\s*\(offset\s*\(xyz)\s+[^)]*(\)\s*\))')
        offset_text = " ".join(str(value) for value in SWITCH_STEP_OFFSET_MM)
        export_text, corrected = re.subn(switch_pattern, lambda match: match[1] + " " + offset_text + match[2], export_text)
        if corrected != 2:
            raise ValueError(f"Expected two switch STEP registrations, found {corrected}.")
        export_board.write_text(export_text, encoding="utf-8")
        command = [args.kicad_cli, "pcb", "export", "glb", "--force", "--subst-models", "--include-pads", "--include-silkscreen", "--include-soldermask", "--output", str(output / "framework-pi-board.glb"), str(export_board)]
        result = subprocess.run(command, text=True, capture_output=True, check=True)
        missing = re.findall(r"Could not add 3D model to ([^.]+)\.", result.stdout + result.stderr)
        if set(missing) - {"P1"}:
            raise RuntimeError(f"Missing component CAD: {missing}. Supply the original STEP libraries before publishing.")
        registration_checks = verify_switch_registration(output / "framework-pi-board.glb", tree)
        print(result.stdout)
        for side, layer in (("front", "F.SilkS"), ("back", "B.SilkS")):
            svg = output / f"framework-pi-silk-{side}.svg"
            subprocess.run([args.kicad_cli, "pcb", "export", "svg", "--output", str(svg), "--layers", layer, "--black-and-white", "--exclude-drawing-sheet", "--page-size-mode", "1", "--mode-single", str(export_board)], check=True)
            artwork = svg.read_text(encoding="utf-8")
            artwork = re.sub(r'width="[^"]+" height="[^"]+" viewBox="[^"]+"', 'width="1560" height="1800" viewBox="127 127 26 30"', artwork, count=1)
            artwork = artwork.replace("#000000", "#edece5")
            svg.write_text("\n".join(line.rstrip() for line in artwork.splitlines()).rstrip() + "\n", encoding="utf-8")

    shutil.copyfile(shell, output / "framework-pi-enclosure.stl")
    connector = repository / "assets/models/framework-esp32/framework-usbc.glb"
    shutil.copyfile(connector, output / "framework-pi-usbc.glb")
    metadata = {
        "name": "Raspberry Pi Expansion Card", "controller": "RP2354B",
        "board": {"file": "framework-pi-board.glb", "units": "metres", "upAxis": "+Y", "kicadXAxis": "+X", "kicadYAxis": "+Z", "scaleToMillimetres": 1000, "sourceCentreMm": [140, 0, 142], "centredTranslationMm": [-140, 0, -142], "sizeMm": [26, 0.8, 30], "assemblyBottomMm": 3.1},
        "connector": {"file": "framework-pi-usbc.glb", "node": "P1", "scaleToMillimetres": 1000, "rotationRadians": [-1.5707963267948966, 0, 0], "positionBoardLocalMm": [0, 0.8, -16.4]},
        "enclosure": {"file": "framework-pi-enclosure.stl", "units": "millimetres", "rotationRadians": [0, 0, 0], "translationMm": [0, 0, 15], "sourceBoundsMm": [[-15, 0, -32], [15, 6.8, 0]], "kind": "Framework reference housing with threaded inserts"},
        "silk": {"front": "framework-pi-silk-front.svg", "back": "framework-pi-silk-back.svg", "viewBoxMm": [127, 127, 26, 30], "planeSizeMm": [26, 30]},
        "materials": {"pads": "mat_18", "silk": "mat_19", "mask": "mat_20", "core": "mat_21"},
        "footprints": footprints,
        "modelRegistrations": switches,
        "switchRegistrationChecks": registration_checks,
        "provenance": [{"file": board_rel, "sha256": originals[board]}, {"file": shell_rel, "sha256": originals[shell]}, {"file": "assets/models/framework-esp32/framework-usbc.glb", "sha256": sha256(connector)}],
        "attribution": "Framework reference outline and enclosure: Framework Computer Inc, CC BY 4.0. Component geometry follows the supplied project model references."
    }
    (output / "assembly.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if any(sha256(path) != digest for path, digest in originals.items()):
        raise RuntimeError("A source file changed during export")
    print(f"Exported {len(footprints)} footprints. Original board and enclosure hashes unchanged.")


if __name__ == "__main__":
    main()
