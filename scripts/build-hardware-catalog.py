"""Export original KiCad boards to renderer-ready GLB, SVG markings and metadata.

The electronics directory is read-only. A temporary board copy resolves physical
libraries; export never saves or updates the original project. Requires KiCad 9.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import tempfile


TARGETS = {
    "microphone": "Microphone/Microphone.kicad_pcb",
    "nixie-clock": "Nixie Tube Clock/Nixie Tube Clock.kicad_pcb",
    "usense": "uSense/uSense.kicad_pcb",
    "tamagotchi-sd-card": "Tamagotchi SD Card/Tamagotchi SD Card.kicad_pcb",
    "business-card": "Business Card/Business Card V4 - COMP6441/business card.kicad_pcb",
    "framework-logic-analyser": "Framework Expansion Card - Logic Analyser/ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb",
    "lora-receiver": "LoRa Reciever/LoRa Reciever.kicad_pcb",
    "rf-test-board": "RF Test Board/RF Test Board.kicad_pcb",
    "kiku": "Walkman - Blobject/Walkman - Blobject.kicad_pcb",
    "metroboard": "Metroboard/Metroboard V3/Metroboard.kicad_pcb",
    "skylabs-telemetry": "../Skylabs/Mission Systems/Telemetry PCB/Mission Systems PCB v4.0/Mission Systems.kicad_pcb",
    "skylabs-ground-station": "../Skylabs/Mission Systems/Ground Station PCB/Ground Station v1.0/Ground Station v1.0.kicad_pcb",
    "pcb-notebook-front": "Spiral-bound Book Cover/Spiral-bound Book Cover.kicad_pcb",
    "pcb-notebook-back": "Spiral-bound Book Cover/Spiral-bound Book Back.kicad_pcb",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse(text):
    stack, root = [], []
    for token in re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', text):
        if token == "(":
            node = []
            if stack:
                stack[-1].append(node)
            else:
                root = node
            stack.append(node)
        elif token == ")":
            stack.pop()
        else:
            stack[-1].append(token[1:-1].replace('\\"', '"') if token.startswith('"') else token)
    return root


def child(node, key, default=None):
    return next((part for part in node if isinstance(part, list) and part[0] == key), default)


def children(node, key):
    return [part for part in node if isinstance(part, list) and part[0] == key]


def transform(point, node):
    x, y, z = point
    if "matrix" in node:
        m = node["matrix"]
        return tuple(m[i] * x + m[i + 4] * y + m[i + 8] * z + m[i + 12] for i in range(3))
    s = node.get("scale", [1, 1, 1])
    x, y, z = x * s[0], y * s[1], z * s[2]
    qx, qy, qz, qw = node.get("rotation", [0, 0, 0, 1])
    tx, ty, tz = 2 * (qy * z - qz * y), 2 * (qz * x - qx * z), 2 * (qx * y - qy * x)
    t = node.get("translation", [0, 0, 0])
    return (x + qw * tx + qy * tz - qz * ty + t[0], y + qw * ty + qz * tx - qx * tz + t[1], z + qw * tz + qx * ty - qy * tx + t[2])


def read_glb(path):
    content = path.read_bytes()
    if content[:4] != b"glTF":
        raise ValueError("Export is not a GLB")
    length = struct.unpack_from("<I", content, 12)[0]
    model = json.loads(content[20:20 + length])
    start = 20 + length
    binary = content[start + 8:start + 8 + struct.unpack_from("<I", content, start)[0]]
    return model, binary


def write_glb(path, model, binary):
    binary = bytes(binary)
    model['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(model, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def register_manufacturer_models(path, footprints, resolutions):
    gltf, binary = read_glb(path)
    adjustments = []
    for footprint in footprints:
        for original in footprint['models']:
            resolved = resolutions.get(original)
            if not resolved or resolved.parent.name != 'kyocera' or resolved.name != 'SD_Kyocera_145638009511859+.step':
                continue
            node = next((node for node in gltf['nodes'] if node.get('name') == footprint['ref']), None)
            if node is None:
                continue
            angle = math.radians(footprint['atMm'][2] if len(footprint['atMm']) > 2 else 0)
            node['rotation'] = [0, math.sin((angle + math.pi) / 2), 0, math.cos((angle + math.pi) / 2)]
            node['translation'][0] -= math.sin(angle) * .0085
            node['translation'][2] -= math.cos(angle) * .0085
            adjustments.append({'ref': footprint['ref'], 'sourceHash': sha256(resolved), 'nativeRotationDegrees': [0,0,180], 'nativeTranslationMm': [0,8.5,0], 'registration': 'Kyocera BJS5638029 drawing and original footprint: 24.2 mm boss spacing; both 1.4 mm mounting bosses align with the original 1.5 mm NPTH centres; 29 mm housing extent aligns with F.Fab', 'manufacturerUrl': 'https://ele.kyocera.com/en/product/connector/memory_card_connectors/5638/145638009511859/'})
    if adjustments:
        write_glb(path, gltf, binary)
    return adjustments


def append_literal_vrml_boxes(path, footprints, sources, thickness):
    """Preserve supported source VRML Box primitives literally, without proxies."""
    if not sources:
        return []
    gltf, raw = read_glb(path)
    binary = bytearray(raw)
    additions = []
    number = r"([-+\d.eE]+)"
    pattern = re.compile(r"Transform\s*\{\s*translation\s+" + r"\s+".join([number] * 3) + r".*?diffuseColor\s+" + r"\s+".join([number] * 3) + r".*?geometry\s+Box\s*\{\s*size\s+" + r"\s+".join([number] * 3), re.S)
    faces = [((1, 0, 0), [(1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)]), ((-1,0,0), [(-1,-1,1),(-1,1,1),(-1,1,-1),(-1,-1,-1)]), ((0,1,0), [(-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)]), ((0,-1,0), [(-1,-1,1),(-1,-1,-1),(1,-1,-1),(1,-1,1)]), ((0,0,1), [(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]), ((0,0,-1), [(1,-1,-1),(-1,-1,-1),(-1,1,-1),(1,1,-1)])]
    def attribute(values):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(values) * 4, 'target': 34962})
        index = len(gltf['accessors'])
        gltf['accessors'].append({'bufferView': view, 'componentType': 5126, 'count': len(values)//3, 'type': 'VEC3', 'min': [min(values[i::3]) for i in range(3)], 'max': [max(values[i::3]) for i in range(3)]})
        return index
    for ref, source in sources.items():
        text = source.read_text(encoding='utf-8')
        boxes = list(pattern.finditer(text))
        if not boxes or len(boxes) != len(re.findall(r'geometry\s+', text)) or re.search(r'\b(rotation|scale)\b', text):
            continue
        footprint = next(item for item in footprints if item['ref'] == ref)
        if footprint['side'] != 'front' or not footprint.get('literalModelTransform', False):
            continue
        primitives = []
        for box in boxes:
            cx,cy,cz,r,g,b,sx,sy,sz = map(float,box.groups())
            positions,normals = [],[]
            for normal,corners in faces:
                for i in (0,1,2,0,2,3):
                    vx,vy,vz=corners[i]
                    x,y,z=(cx+vx*sx/2)*.00254,(cy+vy*sy/2)*.00254,(cz+vz*sz/2)*.00254
                    positions.extend((x,z,-y));normals.extend((normal[0],normal[2],-normal[1]))
            material=len(gltf['materials'])
            gltf['materials'].append({'name':f'source_vrml_{ref}_{material}','pbrMetallicRoughness':{'baseColorFactor':[r,g,b,1],'metallicFactor':0,'roughnessFactor':.55}})
            primitives.append({'attributes':{'POSITION':attribute(positions),'NORMAL':attribute(normals)},'material':material,'mode':4})
        mesh=len(gltf['meshes']);gltf['meshes'].append({'name':ref,'primitives':primitives})
        angle=math.radians(footprint['atMm'][2] if len(footprint['atMm'])>2 else 0)
        node=len(gltf['nodes']);gltf['nodes'].append({'name':ref,'mesh':mesh,'translation':[footprint['atMm'][0]/1000,(thickness-.005)/1000,footprint['atMm'][1]/1000],'rotation':[0,math.sin(angle/2),0,math.cos(angle/2)]})
        scene_nodes = gltf['scenes'][gltf.get('scene',0)]['nodes']
        root_node = gltf['nodes'][scene_nodes[0]]
        if len(scene_nodes) != 1 or any(key in root_node for key in ('matrix','rotation','translation','scale')):
            raise ValueError('Cannot register source VRML in a transformed export root')
        root_node.setdefault('children',[]).append(node)
        additions.append({'ref':ref,'file':source.name,'sha256':sha256(source),'conversion':'Literal source VRML Box primitives; KiCad 0.1-inch VRML units converted to metres'})
    if additions:
        write_glb(path, gltf, binary)
    return additions


def inspect_glb(path):
    model, binary = read_glb(path)
    roles = {}
    expected = {"pads": ([.5, .5, .5, 1], 1, .4), "silk": ([1, 1, 1, .9], 0, .9), "mask": ([.08, .2, .14, .83], 0, .6), "core": ([.3, .3, .3, 1], 0, .8)}
    for i, material in enumerate(model["materials"]):
        pbr = material.get("pbrMetallicRoughness", {})
        for role, (color, metal, rough) in expected.items():
            if len(pbr.get("baseColorFactor", [])) == 4 and abs(pbr.get("metallicFactor", -1) - metal) < .005 and abs(pbr.get("roughnessFactor", -1) - rough) < .005:
                roles[role] = {"index": i, "name": material.get("name", f"material_{i}")}
    if "core" not in roles:
        raise ValueError("Cannot identify exported PCB core material; bounds would be unreliable")
    core_index = roles["core"]["index"]
    # KiCad appends pads/silk/mask/core after component materials. A custom
    # project palette can give silk a different metallic coefficient.
    if core_index == len(model['materials']) - 1 and core_index >= 3:
        for role, offset in [('pads', 3), ('silk', 2), ('mask', 1)]:
            index = core_index - offset
            roles[role] = {'index':index,'name':model['materials'][index].get('name',f'material_{index}')}
    low, high = [math.inf] * 3, [-math.inf] * 3
    triangles = 0
    for mesh in model["meshes"]:
        for primitive in mesh["primitives"]:
            triangles += model["accessors"][primitive.get("indices", primitive["attributes"]["POSITION"])]["count"] // 3

    def visit(index, parents):
        node = model["nodes"][index]
        chain = parents + [node]
        if "mesh" in node:
            for primitive in model["meshes"][node["mesh"]]["primitives"]:
                if primitive.get("material") != core_index:
                    continue
                accessor = model["accessors"][primitive["attributes"]["POSITION"]]
                if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
                    raise ValueError("Unexpected PCB position encoding")
                view = model["bufferViews"][accessor["bufferView"]]
                offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
                stride = view.get("byteStride", 12)
                for v in range(accessor["count"]):
                    point = struct.unpack_from("<fff", binary, offset + v * stride)
                    for ancestor in reversed(chain):
                        point = transform(point, ancestor)
                    for axis in range(3):
                        low[axis] = min(low[axis], point[axis] * 1000)
                        high[axis] = max(high[axis], point[axis] * 1000)
        for nested in node.get("children", []):
            visit(nested, chain)

    for index in model["scenes"][model.get("scene", 0)]["nodes"]:
        visit(index, [])
    if not all(math.isfinite(value) for value in low + high):
        raise ValueError("No PCB core geometry found")
    return model, {name: entry["name"] for name, entry in roles.items()}, [round(low[0], 5), round(low[2], 5), round(high[0], 5), round(high[2], 5)], [round(low[1], 5), round(high[1], 5)], triangles


class Libraries:
    def __init__(self, roots, standard):
        self.roots, self.standard, self.index = roots, standard, None

    def resolve(self, original, board):
        expanded = original.replace("${KIPRJMOD}", board.parent.as_posix())
        if self.standard:
            expanded = re.sub(r"\$\{KICAD\d*_3DMODEL_DIR\}", lambda _: self.standard.as_posix(), expanded)
        expanded = os.path.expandvars(expanded)
        candidate = Path(expanded)
        if not candidate.is_absolute():
            candidate = board.parent / candidate
        choices = [candidate] if candidate.suffix.lower() in (".step", ".stp", ".igs", ".iges") else [candidate.with_suffix(extension) for extension in (".step", ".stp", ".igs", ".iges")]
        for option in choices:
            try:
                if option.is_file():
                    return option.resolve()
            except OSError:
                pass  # An old removable-drive reference can be resolved from a library.
        if self.index is None:
            self.index = {}
            for root in self.roots:
                if not root.is_dir():
                    continue
                for directory, folders, files in os.walk(root):
                    folders[:] = [f for f in folders if f not in (".git", "node_modules", "__pycache__", "backups")]
                    for filename in files:
                        if Path(filename).suffix.lower() in (".step", ".stp", ".igs", ".iges"):
                            self.index.setdefault(Path(filename).stem.lower(), []).append(Path(directory) / filename)
        matches = self.index.get(candidate.stem.lower(), [])
        # Equal basenames are only accepted if the underlying CAD is identical.
        if matches and len({sha256(item) for item in matches}) == 1:
            return matches[0].resolve()
        return None


def export(slug, relative, root, destination, cli, libraries):
    board = root / relative
    if not board.is_file():
        return {"slug": slug, "source": relative, "exported": False, "reason": "Source board not found"}
    original_hash = sha256(board)
    source_text = board.read_text(encoding="utf-8-sig")
    tree = parse(source_text)
    footprints = []
    for part in children(tree, "footprint") + children(tree, "module"):
        props = {item[1]: item[2] for item in children(part, "property")}
        for item in children(part, "fp_text"):
            props.setdefault({"reference": "Reference", "value": "Value"}.get(item[1], item[1]), item[2])
        at = child(part, "at", ["at", "0", "0"])
        attrs = child(part, "attr", [])
        models = [model for model in children(part, "model") if not child(model, "hide")]
        literal = bool(models) and all(all(float(v) == expected for v in (child(child(model, kind, []), 'xyz', [None] + [str(expected)]*3)[1:])) for model in models for kind, expected in [('offset',0),('rotate',0),('scale',1)])
        footprints.append({"ref": props.get("Reference", ""), "value": props.get("Value", ""), "footprint": part[1], "atMm": [float(value) for value in at[1:]], "side": "back" if child(part, "layer", [None, "F.Cu"])[1].startswith("B.") else "front", "hasModel": bool(models), "dnp": "dnp" in attrs, "excludeFromBom": "exclude_from_bom" in attrs, "models": [model[1] for model in models], "literalModelTransform": literal})
    if not footprints:
        return {"slug": slug, "source": relative, "sourceHash": original_hash, "exported": False, "reason": "No populated board content"}
    def has_outline(node):
        if isinstance(node, list):
            if node and isinstance(node[0], str) and node[0].startswith(("gr_", "fp_")) and child(node, "layer", [None, ""])[1] == "Edge.Cuts":
                return True
            return any(has_outline(item) for item in node if isinstance(item, list))
        return False
    if not has_outline(tree):
        return {"slug": slug, "source": relative, "sourceHash": original_hash, "exported": False, "reason": "No physical board outline"}
    out = destination / slug
    out.mkdir(parents=True, exist_ok=True)
    unpopulated = slug.startswith("pcb-notebook-")
    resolutions, missing, vrml = {}, [], {}
    for footprint in footprints:
        if unpopulated:
            continue
        for model in footprint["models"]:
            if model not in resolutions:
                resolutions[model] = libraries.resolve(model, board)
            if resolutions[model] is None:
                missing.append({"ref": footprint["ref"], "reason": "Referenced physical model could not be resolved", "model": Path(model).name})
                for library in libraries.roots:
                    candidate = library / Path(model).name
                    if candidate.suffix.lower() == '.wrl' and candidate.is_file():
                        vrml[footprint['ref']] = candidate
                        break
    def rewrite(match):
        model = match.group(1)
        resolved = resolutions.get(model)
        return '(model "' + resolved.as_posix() + '"' if resolved else match.group(0)
    export_text = re.sub(r'\(model "([^"\n]+)"', rewrite, source_text)
    try:
        with tempfile.TemporaryDirectory(prefix="hardware-catalog-") as temporary:
            temporary_board = Path(temporary) / board.name
            temporary_board.write_text(export_text, encoding="utf-8")
            command = [str(cli), "pcb", "export", "glb", "--force", "--subst-models", "--no-dnp", "--include-pads", "--include-silkscreen", "--include-soldermask", "--output", str(out / "board.glb"), str(temporary_board)]
            if unpopulated:
                command.insert(-1, "--no-components")
            if unpopulated or slug == "business-card":
                command[-1:-1] = ["--include-tracks", "--include-zones"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=600)
            if result.returncode:
                raise RuntimeError((result.stdout + result.stderr)[-2000:])
            general = child(tree, "general", [])
            registrations = register_manufacturer_models(out / "board.glb", footprints, resolutions)
            additions = append_literal_vrml_boxes(out / "board.glb", footprints, vrml, float(child(general, 'thickness', [None,'1.6'])[1]))
            missing = [item for item in missing if item['ref'] not in {entry['ref'] for entry in additions}]
            gltf, materials, bounds, height, triangles = inspect_glb(out / "board.glb")
            names = {node.get("name") for node in gltf["nodes"]}
            export_missing = set(re.findall(r"Could not add 3D model to ([^.]+)\.", result.stdout + result.stderr))
            for footprint in footprints:
                footprint["modelExported"] = footprint["ref"] in names and not footprint["dnp"]
                if footprint["hasModel"] and not footprint["modelExported"] and not footprint["dnp"] and not unpopulated and not any(item["ref"] == footprint["ref"] for item in missing):
                    missing.append({"ref": footprint["ref"], "reason": "KiCad could not export referenced physical model" if footprint["ref"] in export_missing else "No physical group in exported GLB"})
                footprint.pop("models")
                footprint.pop("literalModelTransform")
            width, depth = bounds[2] - bounds[0], bounds[3] - bounds[1]
            if width <= 0 or depth <= 0:
                raise ValueError("Invalid PCB bounds")
            for side, layer in (("front", "F.SilkS"), ("back", "B.SilkS")):
                svg = out / f"silk-{side}.svg"
                subprocess.run([str(cli), "pcb", "export", "svg", "--output", str(svg), "--layers", layer, "--black-and-white", "--exclude-drawing-sheet", "--drill-shape-opt", "0", "--page-size-mode", "1", "--mode-single", str(temporary_board)], check=True, capture_output=True, text=True, timeout=120)
                art = svg.read_text(encoding="utf-8")
                w, h = round(width / max(width, depth) * 2048), round(depth / max(width, depth) * 2048)
                art = re.sub(r'width="[^"]+" height="[^"]+" viewBox="[^"]+"', f'width="{w}" height="{h}" viewBox="{bounds[0]} {bounds[1]} {width} {depth}"', art, count=1)
                art = art.replace("#000000", "#edece5")
                svg.write_text("\n".join(line.rstrip() for line in art.splitlines()).rstrip() + "\n", encoding="utf-8")
        base = f"/assets/models/hardware/{slug}/"
        general = child(tree, "general", [])
        thickness = float(child(general, "thickness", [None, str(height[1] - height[0])])[1])
        metadata = {"slug": slug, "modelUrl": base + "board.glb", "boundsMm": bounds, "thicknessMm": thickness, "coreHeightMm": height, "scaleToMillimetres": 1000, "upAxis": "+Y", "kicadXAxis": "+X", "kicadYAxis": "+Z", "translationMm": [-(bounds[0] + bounds[2]) / 2, -height[0], -(bounds[1] + bounds[3]) / 2], "footprints": footprints, "materials": materials, "silk": {"frontUrl": base + "silk-front.svg", "backUrl": base + "silk-back.svg", "viewBoxMm": [bounds[0], bounds[1], width, depth]}, "source": relative, "sourceHash": original_hash, "missingModels": missing, "unmodeledFootprints": [item["ref"] for item in footprints if not item["hasModel"] and not item["dnp"]], "modelledComponentCount": sum(item["modelExported"] for item in footprints), "triangleCount": triangles, "modelBytes": (out / "board.glb").stat().st_size, "resolvedLibraryModelCount": len([entry for entry in resolutions.values() if entry]), "exportedWith": "KiCad CLI GLB export; original component geometry, pads, silk and soldermask"}
        metadata["unpopulated"] = unpopulated
        metadata["copperIncluded"] = unpopulated or slug == "business-card"
        metadata["materialProperties"] = {role: next(material["pbrMetallicRoughness"] for material in gltf["materials"] if material.get("name") == name) for role, name in materials.items()}
        metadata["literalVrmlModels"] = additions
        metadata["modelRegistrations"] = registrations
        used_libraries = []
        library_root = destination / '_libraries'
        for resolved in {item for item in resolutions.values() if item}:
            try:
                library_file = resolved.relative_to(library_root.resolve()).as_posix()
            except ValueError:
                continue
            used_libraries.append({'file':library_file,'sha256':sha256(resolved)})
        metadata['additionalLibraryModels'] = used_libraries
        if slug == 'metroboard':
            metadata['geometryFallbacks'] = [{'refs':[part['ref'] for part in footprints if part['value']=='WS2812B-2020'], 'sourceUrl':'/assets/metroboard-3d.js', 'geometrySourceUrl':'/assets/pcb-object-explorer.js', 'bodySizeMm':[2,.72,2], 'kind':'Existing published package geometry', 'note':'The original exact STEP/WRL reference is unavailable. Preserve the existing Metroboard viewer LED geometry with the authored PCB positions; this is a documented package representation, not supplier CAD.'}]
            metadata['dimensionedLedFallback'] = {'value':'WS2812B-2020','bodySizeMm':[2,.72,2],'windowSizeMm':[1.12,.035,1.12],'padSizeMm':[.56,.035,.68],'notchSizeMm':[.26,.028,.26],'source':'/assets/pcb-object-explorer.js','placementsSource':'/assets/metroboard-3d.js','kind':'Existing published package representation; not supplier CAD'}
        if slug == "framework-logic-analyser":
            connector = Path(__file__).resolve().parents[1] / 'assets/models/framework-esp32/framework-usbc.glb'
            metadata['connector'] = {'modelUrl':'/assets/models/framework-esp32/framework-usbc.glb','node':'P1','ref':'P1','scaleToMillimetres':1000,'rotationRadians':[-math.pi/2,0,0],'positionBoardLocalMm':[0,.8,-16.4],'sourceHash':sha256(connector),'provenance':'Existing exact Molex 105444 connector geometry; same part and placement as the Framework reference card'}
            metadata['missingModels'] = [item for item in metadata['missingModels'] if item['ref'] != 'P1']
            entry = next(item for item in footprints if item['ref'] == 'P1')
            entry.update({'providedBy':'connector','modelExported':True,'boardModelExported':False})
            metadata['modelledComponentCount'] += 1
        (out / "assembly.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(f"{slug}: {metadata['modelledComponentCount']}/{len(footprints)} physical groups, {len(metadata['missingModels'])} missing references, {metadata['modelBytes']:,} bytes, bounds {bounds}", flush=True)
        return {"slug": slug, "exported": True, "metadataUrl": base + "assembly.json", "source": relative, "sourceHash": original_hash, "missingModelCount": len(metadata['missingModels']), "modelBytes": metadata["modelBytes"]}
    finally:
        if sha256(board) != original_hash:
            raise RuntimeError(f"Original board changed during export: {relative}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path)
    parser.add_argument("--kicad-cli", type=Path, default=Path("kicad-cli"))
    parser.add_argument("--kicad-models", type=Path, help="KiCad's share/kicad/3dmodels directory")
    parser.add_argument("--model-library", type=Path, action="append", default=[], help="Additional real STEP/IGS model library; may be repeated")
    parser.add_argument("--only", help="Comma-separated target slugs")
    parser.add_argument("--board", action="append", default=[], help="Add or override slug=relative/path.kicad_pcb")
    args = parser.parse_args()
    targets = dict(TARGETS)
    for value in args.board:
        slug, relative = value.split("=", 1)
        if not re.fullmatch(r"[a-z0-9-]+", slug):
            raise ValueError("Board slug must use lowercase letters, digits and hyphens")
        targets[slug] = relative
    selected = args.only.split(",") if args.only else list(targets)
    destination = Path(__file__).resolve().parents[1] / "assets/models/hardware"
    destination.mkdir(parents=True, exist_ok=True)
    source = args.source_root.resolve()
    standard = args.kicad_models
    if not standard and args.kicad_cli.is_file():
        standard = args.kicad_cli.resolve().parents[1] / "share/kicad/3dmodels"
    libraries = Libraries(args.model_library + [destination / '_libraries'] + ([standard] if standard else []) + [source], standard)
    catalog = {"schemaVersion": 1, "boards": []}
    existing = destination / "catalog.json"
    if existing.exists():
        catalog = json.loads(existing.read_text(encoding="utf-8"))
    for slug in selected:
        try:
            result = export(slug, targets[slug], source, destination, args.kicad_cli, libraries)
        except Exception as error:
            result = {"slug": slug, "source": targets.get(slug), "exported": False, "reason": str(error)}
            print(f"{slug}: FAILED: {error}", flush=True)
        catalog["boards"] = [board for board in catalog["boards"] if board["slug"] != slug] + [result]
        existing.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    if any(not board["exported"] and board["slug"] in selected and board.get("reason") not in ("No populated board content", "No physical board outline") for board in catalog["boards"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
