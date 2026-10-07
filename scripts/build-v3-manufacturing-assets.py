"""Register TramTrace fabrication artwork and exact CAD placements for v3.

Existing source CAD and plots are read-only. Paste apertures come from the
production Gerber, not from a decorative approximation of the copper layer.
The small Gerber reader deliberately rejects unsupported drawing commands.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/models/manufacturing/tramtrace"
VIEWBOX = "5.6897 1.11 207.81 94.55"
SOURCE_VIEWPORT = 'width="223.7486mm" height="111.1758mm" viewBox="0.0000 0.0000 223.7486 111.1758"'
VIEWPORT = f'width="2400" height="1092" viewBox="{VIEWBOX}"'
ORIGIN = [144.055, 0, 102.065]
UNITS = 207.81


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plot(name):
    source = ROOT / f"assets/images/interactive/tramtrace/tramtrace-{name}.svg"
    content = source.read_text(encoding="utf-8")
    assert SOURCE_VIEWPORT in content, "Plot registration changed; re-check board bounds."
    return source, content.replace(SOURCE_VIEWPORT, VIEWPORT)


def save(name, content):
    ET.fromstring(content)
    clean = "\n".join(line.rstrip() for line in content.splitlines()).rstrip() + "\n"
    (OUTPUT / name).write_text(clean, encoding="utf-8", newline="\n")


def paste_svg(source):
    text = source.read_text(encoding="utf-8")
    assert "%FSLAX46Y46*%" in text and "%MOMM*%" in text
    definitions = {}
    for number, kind, values in re.findall(r"%ADD(\d+)(\w+),([^*]+)\*%", text):
        values = [float(value) for value in values.split("X")]
        assert kind in {"R", "RotRect", "RoundRect"}, f"Unsupported paste aperture: {kind}"
        definitions[int(number)] = (kind, values)
    assert definitions
    primitives = []
    selected = None
    flashes = 0
    # Remove all extended command/macro blocks before reading plotting commands.
    commands = re.sub(r"%.*?%", "", text, flags=re.S).split("*")
    for command in commands:
        command = command.strip()
        if not command or command.startswith("G04") or command in {"G01", "M02"}:
            continue
        aperture = re.fullmatch(r"D(\d+)", command)
        if aperture:
            selected = int(aperture[1])
            assert selected in definitions
            continue
        flash = re.fullmatch(r"X(-?\d+)Y(-?\d+)D03", command)
        assert flash is not None, f"Unsupported paste drawing: {command}"
        x, y = int(flash[1]) / 1e6, int(flash[2]) / 1e6
        kind, values = definitions[selected]
        if kind in {"R", "RotRect"}:
            width, height = values[:2]
            angle = values[2] if kind == "RotRect" else 0
            shape = f'<rect x="{-width / 2:g}" y="{-height / 2:g}" width="{width:g}" height="{height:g}" transform="rotate({angle:g})"/>'
        else:
            assert len(values) == 10 and values[-1] == 0
            radius, *corners = values[:-1]
            points = " ".join(f"{corners[index]:g},{corners[index + 1]:g}" for index in range(0, 8, 2))
            shape = f'<polygon points="{points}" stroke="white" stroke-width="{radius * 2:g}" stroke-linejoin="round"/>'
        primitives.append(f'<g transform="translate({x:.6f} {y:.6f})">{shape}</g>')
        flashes += 1
    assert flashes > 450, "Incomplete production paste plot"
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" {VIEWPORT}><title>TramTrace front solder-paste apertures</title><g fill="white" transform="translate(-34.4603 -53.68) scale(1 -1)">' + "".join(primitives) + "</g></svg>"
    return svg, flashes


def placements():
    path = ROOT / "assets/models/tramtrace/tramtrace-kicad-source.glb"
    binary = path.read_bytes()
    assert binary[:4] == b"glTF"
    length = struct.unpack_from("<I", binary, 12)[0]
    model = json.loads(binary[20:20 + length])
    root = model["nodes"][model["scenes"][model.get("scene", 0)]["nodes"][0]]
    assert not any(key in root for key in ("matrix", "translation", "rotation", "scale")), "CAD root transform changed"
    result = []
    for index in root["children"]:
        node = model["nodes"][index]
        ref = node.get("name", "")
        if not re.fullmatch(r"(?:LED|U|Q|R|C|J|P|D|F|L|SW|X|Y)\d+", ref) or ref == "C83":
            continue
        assert "matrix" not in node
        mm = [value * 1000 for value in node.get("translation", [0, 0, 0])]
        centre = [(mm[axis] - ORIGIN[axis]) / UNITS for axis in range(3)]
        result.append({"ref": ref, "position": [round(value, 10) for value in centre], "quaternion": node.get("rotation", [0, 0, 0, 1])})
    leds = [item for item in result if item["ref"].startswith("LED")]
    assert len(leds) == 116 and len({item["ref"] for item in result}) == len(result)
    assert all(abs(item["position"][0]) < .51 and abs(item["position"][2]) < .24 for item in result)
    return path, sorted(result, key=lambda item: (re.sub(r"\d", "", item["ref"]), int(re.search(r"\d+", item["ref"])[0])))


def verify_led_registration(paste_source, components):
    pads, ref = {}, None
    for line in paste_source.read_text(encoding="utf-8").splitlines():
        label = re.match(r"%TO.C,([^*]+)\*%", line)
        if label:
            ref = label[1]
        flash = re.match(r"X(-?\d+)Y(-?\d+)D03", line)
        if flash and ref:
            pads.setdefault(ref, []).append([int(flash[1]) / 1e6, -int(flash[2]) / 1e6])
    for component in components:
        if not component["ref"].startswith("LED"):
            continue
        apertures = pads[component["ref"]]
        assert len(apertures) == 4, "LED paste aperture count changed"
        centroid = [sum(point[axis] for point in apertures) / 4 for axis in range(2)]
        cad = [component["position"][0] * UNITS + ORIGIN[0], component["position"][2] * UNITS + ORIGIN[2]]
        assert math.dist(centroid, cad) < .006, f"Paste/CAD registration mismatch: {component['ref']}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", type=Path, default=Path("D:/Electronics Projects/TramTrace/Production"))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = []
    for side in ("front", "back"):
        source, artwork = plot(f"{side}-copper")
        sources.append({"name": source.name, "sha256": digest(source)})
        save(f"{side}-copper.svg", artwork.replace("#000000", "#ffffff"))
    source, artwork = plot("front-mask")
    sources.append({"name": source.name, "sha256": digest(source)})
    save("mask-openings.svg", artwork.replace("#000000", "#ffffff"))
    # F.Mask plots openings. Invert only alpha to obtain a physical coating;
    # the original PCB geometry still clips the outer contour and drilled holes.
    inner = artwork[artwork.index("<g "):artwork.rindex("</svg>")]
    rectangle = '<rect x="5.6897" y="1.11" width="207.81" height="94.55"'
    coat = f'<svg xmlns="http://www.w3.org/2000/svg" {VIEWPORT}><defs><mask id="coat" maskUnits="userSpaceOnUse" x="5.6897" y="1.11" width="207.81" height="94.55">{rectangle} fill="white"/>{inner}</mask></defs>{rectangle} fill="white" mask="url(#coat)"/></svg>'
    save("solder-mask.svg", coat)
    paste_source = args.production / "TramTrace-F_Paste.gbr"
    paste, count = paste_svg(paste_source)
    save("solder-paste.svg", paste)
    sources.append({"name": paste_source.name, "sha256": digest(paste_source)})
    cad, components = placements()
    verify_led_registration(paste_source, components)
    sources.append({"name": cad.name, "sha256": digest(cad)})
    job_source = args.production / "TramTrace-job.gbrjob"
    job = json.loads(job_source.read_text(encoding="utf-8"))
    assert job["GeneralSpecs"]["LayerNumber"] == 2 and job["GeneralSpecs"]["BoardThickness"] == 1.6
    sources.append({"name": job_source.name, "sha256": digest(job_source)})
    metadata = {
        "version": 1, "board": "TramTrace", "boardSizeMm": [207.81, 1.6, 94.55],
        "unitsMm": UNITS, "cadOriginMm": ORIGIN, "upAxis": "+Y", "boardPlane": "XZ", "svgViewBox": [5.6897, 1.11, 207.81, 94.55],
        "stackup": {"copperLayers": 2, "copperMm": .035, "dielectric": "FR4", "dielectricMm": 1.51, "solderMaskMm": .01},
        "pasteApertures": count, "ledCount": 116, "components": components,
        "assets": {"frontCopper": "front-copper.svg", "backCopper": "back-copper.svg", "maskOpenings": "mask-openings.svg", "solderMask": "solder-mask.svg", "solderPaste": "solder-paste.svg", "silkscreen": "/assets/images/v2/tramtrace-silk.svg"},
        "assetSha256": {name: digest(OUTPUT / name) for name in ("front-copper.svg", "back-copper.svg", "mask-openings.svg", "solder-mask.svg", "solder-paste.svg")},
        "sources": sources,
        "presentation": "An explanatory fabrication and assembly sequence; not a recording of a particular factory process or the board's production placement order."
    }
    (OUTPUT / "manufacturing.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Registered 5 fabrication plots, {count} paste apertures, {len(components)} physical components ({len([p for p in components if p['ref'].startswith('LED')])} LEDs).")


if __name__ == "__main__":
    main()
