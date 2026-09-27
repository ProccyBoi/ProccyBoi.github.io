"""Export the Raspberry Pi expansion card without modifying the electronics project.

Requires KiCad 9 and the STEP companions of the models referenced by the board.
The local project path is supplied explicitly; it is not embedded in published assets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


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
        export_board.write_text(export_text, encoding="utf-8")
        command = [args.kicad_cli, "pcb", "export", "glb", "--force", "--subst-models", "--include-pads", "--include-silkscreen", "--include-soldermask", "--output", str(output / "framework-pi-board.glb"), str(export_board)]
        result = subprocess.run(command, text=True, capture_output=True, check=True)
        missing = re.findall(r"Could not add 3D model to ([^.]+)\.", result.stdout + result.stderr)
        if set(missing) - {"P1"}:
            raise RuntimeError(f"Missing component CAD: {missing}. Supply the original STEP libraries before publishing.")
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
        "provenance": [{"file": board_rel, "sha256": originals[board]}, {"file": shell_rel, "sha256": originals[shell]}, {"file": "assets/models/framework-esp32/framework-usbc.glb", "sha256": sha256(connector)}],
        "attribution": "Framework reference outline and enclosure: Framework Computer Inc, CC BY 4.0. Component geometry follows the supplied project model references."
    }
    (output / "assembly.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if any(sha256(path) != digest for path, digest in originals.items()):
        raise RuntimeError("A source file changed during export")
    print(f"Exported {len(footprints)} footprints. Original board and enclosure hashes unchanged.")


if __name__ == "__main__":
    main()
