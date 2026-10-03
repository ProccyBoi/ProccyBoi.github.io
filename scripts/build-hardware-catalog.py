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
    "tamagotchi-sd-card": "Tamagotchi SD Card/Tamagotchi SD Card.kicad_pcb",
    "framework-logic-analyser": "Framework Expansion Card - Logic Analyser/ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb",
    "lora-receiver": "LoRa Reciever/LoRa Reciever.kicad_pcb",
    "rf-test-board": "RF Test Board/RF Test Board.kicad_pcb",
    "metroboard": "Metroboard/Metroboard V3/Metroboard.kicad_pcb",
    "skylabs-telemetry": "../Skylabs/Mission Systems/Telemetry PCB/Mission Systems PCB v4.0/Mission Systems.kicad_pcb",
    "skylabs-ground-station": "../Skylabs/Mission Systems/Ground Station PCB/Ground Station v1.0/Ground Station v1.0.kicad_pcb",
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


def compact_source_geometry(path):
    """Batch identical-material STEP faces without changing a single vertex.

    KiCad emits one primitive per CAD face. Combining those primitives and
    interning byte-identical position/normal pairs preserves the expanded
    triangle stream, while removing thousands of accessor/JSON objects.
    """
    gltf, raw = read_glb(path)
    if any(gltf.get(key) for key in ('images', 'skins', 'animations')):
        raise ValueError('Face batching only supports static, untextured CAD')
    sizes = {5121: 1, 5123: 2, 5125: 4, 5126: 4}
    formats = {5121: 'B', 5123: 'H', 5125: 'I'}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def rows(model, binary, index):
        accessor = model['accessors'][index]
        if accessor.get('sparse') or accessor.get('normalized'):
            raise ValueError('Unexpected sparse/normalised CAD accessor')
        view = model['bufferViews'][accessor['bufferView']]
        width = sizes[accessor['componentType']] * widths[accessor['type']]
        offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', width)
        return [bytes(binary[offset + n * stride:offset + n * stride + width]) for n in range(accessor['count'])]

    def groups(model, binary, mesh):
        result = {}
        for primitive in mesh['primitives']:
            if set(primitive) - {'attributes', 'indices', 'material', 'mode'} or primitive.get('mode', 4) != 4:
                raise ValueError('Unexpected CAD primitive in lossless batching')
            names = tuple(sorted(primitive['attributes']))
            if names != ('NORMAL', 'POSITION'):
                raise ValueError('Expected position and normal CAD attributes')
            if any(model['accessors'][index]['componentType'] != 5126 or model['accessors'][index]['type'] != 'VEC3' for index in primitive['attributes'].values()):
                raise ValueError('Expected float32 CAD attributes')
            key = (primitive.get('material'), names)
            arrays = [rows(model, binary, primitive['attributes'][name]) for name in names]
            records = list(zip(*arrays))
            if 'indices' in primitive:
                accessor = model['accessors'][primitive['indices']]
                indices = [struct.unpack('<' + formats[accessor['componentType']], value)[0] for value in rows(model, binary, primitive['indices'])]
            else:
                indices = range(len(records))
            group = result.setdefault(key, {'records': [], 'indices': [], 'lookup': {}, 'hash': hashlib.sha256()})
            for index in indices:
                record = records[index]
                group['hash'].update(b''.join(record))
                mapped = group['lookup'].get(record)
                if mapped is None:
                    mapped = len(group['records'])
                    group['lookup'][record] = mapped
                    group['records'].append(record)
                group['indices'].append(mapped)
        return result

    before_bytes = path.stat().st_size
    before_primitives = sum(len(mesh['primitives']) for mesh in gltf['meshes'])
    meshes = [groups(gltf, raw, mesh) for mesh in gltf['meshes']]
    signatures = [[(key, group['hash'].hexdigest(), len(group['indices'])) for key, group in entries.items()] for entries in meshes]
    binary = bytearray()
    gltf['accessors'], gltf['bufferViews'] = [], []

    def accessor(data, component, kind, count, target, bounds=None):
        binary.extend(b'\0' * (-len(binary) % 4))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data), 'target': target})
        binary.extend(data)
        index = len(gltf['accessors'])
        entry = {'bufferView': view, 'componentType': component, 'count': count, 'type': kind}
        if bounds:
            entry.update({'min': bounds[0], 'max': bounds[1]})
        gltf['accessors'].append(entry)
        return index

    for mesh, entries in zip(gltf['meshes'], meshes):
        mesh['primitives'] = []
        for (material, names), group in entries.items():
            attributes = {}
            for axis, name in enumerate(names):
                data = b''.join(record[axis] for record in group['records'])
                values = list(struct.iter_unpack('<fff', data))
                bounds = [[min(value[i] for value in values) for i in range(3)], [max(value[i] for value in values) for i in range(3)]]
                attributes[name] = accessor(data, 5126, 'VEC3', len(values), 34962, bounds)
            code, component = ('H', 5123) if len(group['records']) <= 65536 else ('I', 5125)
            indices = accessor(struct.pack('<' + code * len(group['indices']), *group['indices']), component, 'SCALAR', len(group['indices']), 34963)
            primitive = {'attributes': attributes, 'indices': indices, 'mode': 4}
            if material is not None:
                primitive['material'] = material
            mesh['primitives'].append(primitive)
    verified = [[(key, group['hash'].hexdigest(), len(group['indices'])) for key, group in groups(gltf, binary, mesh).items()] for mesh in gltf['meshes']]
    if signatures != verified:
        raise ValueError('Lossless batching altered source triangle attributes')
    write_glb(path, gltf, binary)
    return {'method': 'Same-material face batching and byte-identical vertex interning; no decimation', 'beforeBytes': before_bytes, 'afterBytes': path.stat().st_size, 'beforePrimitives': before_primitives, 'afterPrimitives': sum(len(mesh['primitives']) for mesh in gltf['meshes']), 'expandedTriangleAttributesVerified': True, 'triangleStreamHash': hashlib.sha256(json.dumps(signatures).encode()).hexdigest()}


def register_manufacturer_models(path, footprints, resolutions, slug=None, thickness=1.6):
    gltf, binary = read_glb(path)
    adjustments = []
    for footprint in footprints:
        for original in footprint['models']:
            resolved = resolutions.get(original)
            if slug in ('skylabs-telemetry', 'skylabs-ground-station') and resolved and resolved.name == 'USB-C_SMD-TYPE-C-31-M-12_1.step':
                node = next(node for node in gltf['nodes'] if node.get('name') == footprint['ref'])
                angle = math.radians(footprint['atMm'][2] if len(footprint['atMm']) > 2 else 0)
                delta = [math.sin(angle) * -.00034, 0, math.cos(angle) * -.00034]
                node['translation'] = [value + offset for value, offset in zip(node['translation'], delta)]
                adjustments.append({'ref': footprint['ref'], 'file': resolved.name, 'sourceHash': sha256(resolved), 'worldTranslationCorrectionMm': [round(value * 1000, 9) for value in delta], 'sourceModelOffsetMm': [0,-1.39,0], 'registeredModelOffsetMm': [0,-1.05,0], 'registration': 'Exact authored HRO model retained. Its bosses at native X +/-2.89 and Z 3.65 mm register to footprint NPTH centres X +/-2.89, Y -2.60 mm; source offset missed the holes by 0.34 mm.'})
                continue
            if slug == 'skylabs-telemetry' and footprint['ref'] == 'Q4' and resolved and resolved.name == 'SOT-23.step':
                node = next(node for node in gltf['nodes'] if node.get('name') == footprint['ref'])
                angle = math.radians(footprint['atMm'][2] if len(footprint['atMm']) > 2 else 0)
                x, y = 1.2, 1.025
                node['translation'] = [(footprint['atMm'][0] + math.cos(angle)*x + math.sin(angle)*y)/1000, (thickness-.005)/1000, (footprint['atMm'][1] - math.sin(angle)*x + math.cos(angle)*y)/1000]
                node['rotation'] = [0,math.sin(angle/2),0,math.cos(angle/2)]
                adjustments.append({'ref': 'Q4', 'file': resolved.name, 'sourceHash': sha256(resolved), 'registeredPackageCentreInFootprintMm': [1.2,1.025], 'registration': 'The custom P200_SOT-23 footprint origin is pad 1. Centre the KiCad SOT-23 package between pads at (0,0), (0,2.05), (2.4,1.03) mm, retaining the footprint rotation. The original hidden library alternate confirms the package family.', 'manufacturerUrl': 'https://diotec.com/files/diotec/productfiles/datasheet/mmbt4403.pdf'})
                continue
            if resolved and resolved.parent.name == 'source-cad' and resolved.name in ('ublox_NEO.step','USB_C_Receptacle_HRO_TYPE-C-31-M-12.step'):
                node = next((node for node in gltf['nodes'] if node.get('name') == footprint['ref']), None)
                if node is None:
                    raise ValueError('Registered manufacturer part was not exported')
                if resolved.name == 'ublox_NEO.step':
                    # Official u-blox assembly origin is far from the package.
                    # Its 3 mm contact gap has opposite polarity to KiCad Y.
                    translation = [-.047527640752106436,.0004475,-.018112416107382553]
                    proof = 'Official NEO package, 12.2 x 16 mm; rotate 180 degrees after centring. Both contact rows match the authored 1.1 mm pitch and the asymmetric -0.4/+2.6 mm pad gap.'
                    url = 'https://github.com/u-blox/3D-Step-Models-Library/blob/master/POS/NEO.STEP'
                else:
                    translation = [0,0,.00105]
                    proof = 'Exact HRO TYPE-C-31-M-12 model. Rotated 180 degrees with +1.05 mm KiCad Y registration: shell matches F.Fab +/-3.65 mm, bosses match +/-2.89,-2.60 mm and contact row matches -4.045 mm.'
                    url = None
                children_indices = node.pop('children', [])
                if 'mesh' in node:
                    child_index = len(gltf['nodes'])
                    gltf['nodes'].append({'mesh':node.pop('mesh')})
                    children_indices.append(child_index)
                wrapper = len(gltf['nodes'])
                gltf['nodes'].append({'name':footprint['ref']+'_manufacturer_registration','children':children_indices,'rotation':[0,1,0,0],'translation':translation})
                node['children'] = [wrapper]
                adjustments.append({'ref':footprint['ref'],'file':resolved.name,'sourceHash':sha256(resolved),'nativeGlbRotationRadians':[0,math.pi,0],'nativeGlbTranslationMm':[value*1000 for value in translation],'registration':proof,'manufacturerUrl':url})
                continue
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


def preserve_authored_vrml_meshes(path, footprints, board, libraries):
    """Use the selected EasyEDA WRL frame, not a differently centred STEP companion.

    KiCad's exported reference node already contains the exact footprint side,
    rotation and model offset. Replace only its local mesh. The supported source
    format is a flat set of literal IndexedFaceSet shapes; reject transforms and
    unsupported geometry rather than guessing their meaning.
    """
    gltf, raw = read_glb(path)
    binary = bytearray(raw)
    records = []
    number = r'[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?'

    def attribute(values):
        binary.extend(b'\0' * (-len(binary) % 4))
        offset = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4,'target':34962})
        accessor = len(gltf['accessors'])
        gltf['accessors'].append({'bufferView':view,'componentType':5126,'count':len(values)//3,'type':'VEC3','min':[min(values[i::3]) for i in range(3)],'max':[max(values[i::3]) for i in range(3)]})
        return accessor

    for footprint in footprints:
        if len(footprint['models']) != 1 or 'easyeda' not in footprint['models'][0].lower():
            continue
        original = footprint['models'][0]
        candidates = [Path(original), board.parent / original]
        candidates += [root / Path(original).name for root in libraries.roots]
        source = next((candidate for candidate in candidates if candidate.suffix.lower() == '.wrl' and candidate.is_file()), None)
        if source is None:
            continue
        source_text = source.read_text(encoding='utf-8')
        if re.search(r'\bTransform\s*\{', source_text):
            continue
        blocks = re.split(r'\bShape\s*\{', source_text)[1:]
        if not blocks or any('IndexedFaceSet' not in block for block in blocks):
            continue
        node = next((node for node in gltf['nodes'] if node.get('name') == footprint['ref']), None)
        if node is None or 'mesh' not in node:
            continue
        primitives, source_points = [], []
        for block in blocks:
            points_match = re.search(r'\bpoint\s*\[([^]]+)\]', block, re.S)
            indices_match = re.search(r'\bcoordIndex\s*\[([^]]+)\]', block, re.S)
            color_match = re.search(r'\bdiffuseColor\s+(' + number + r')\s+(' + number + r')\s+(' + number + r')', block)
            if not points_match or not indices_match or not color_match:
                raise ValueError('Unsupported authored VRML shape in ' + source.name)
            values = [float(value) for value in re.findall(number, points_match[1])]
            if len(values) % 3:
                raise ValueError('Invalid VRML coordinate count')
            vertices = [(values[i]*.00254, values[i+2]*.00254, -values[i+1]*.00254) for i in range(0,len(values),3)]
            source_points.extend(vertices)
            positions, normals, face = [], [], []
            reverse_winding = bool(re.search(r'\bccw\s+FALSE', block))
            for index in map(int, re.findall(r'-?\d+', indices_match[1])):
                if index >= 0:
                    face.append(index)
                    continue
                for i in range(1,len(face)-1):
                    tri = [vertices[j] for j in (face[0],face[i],face[i+1])]
                    if reverse_winding:
                        tri.reverse()
                    a,b,c = tri
                    u,v = [b[k]-a[k] for k in range(3)],[c[k]-a[k] for k in range(3)]
                    normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                    length = math.sqrt(sum(value*value for value in normal))
                    if length < 1e-20:
                        continue
                    for point in tri:
                        positions.extend(point)
                        normals.extend(value/length for value in normal)
                face = []
            if not positions:
                continue
            # Match KiCad's sRGB-to-linear colour conversion for glTF PBR.
            color = [float(value) for value in color_match.groups()]
            color = [value/12.92 if value <= .04045 else ((value+.055)/1.055)**2.4 for value in color]
            material = len(gltf['materials'])
            gltf['materials'].append({'name':f'authored_wrl_{footprint["ref"]}_{material}','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':color+[1],'metallicFactor':0,'roughnessFactor':.55}})
            primitives.append({'attributes':{'POSITION':attribute(positions),'NORMAL':attribute(normals)},'material':material,'mode':4})
        if not primitives:
            raise ValueError('Authored WRL mesh has no faces')
        previous = [gltf['accessors'][primitive['attributes']['POSITION']] for primitive in gltf['meshes'][node['mesh']]['primitives']]
        prior_bounds = [[round(op(accessor[key][axis] for accessor in previous)*1000,5) for axis in range(3)] for op,key in [(min,'min'),(max,'max')]]
        gltf['meshes'][node['mesh']]['primitives'] = primitives
        authored_bounds = [[round(op(point[axis] for point in source_points)*1000,5) for axis in range(3)] for op in (min,max)]
        records.append({'ref':footprint['ref'],'file':source.name,'sha256':sha256(source),'conversion':'Literal authored VRML IndexedFaceSet triangles; original KiCad reference transform preserved','priorStepLocalBoundsMm':prior_bounds,'authoredLocalBoundsMm':authored_bounds})
    if records:
        write_glb(path,gltf,binary)
    return records


def append_dimensioned_renata(path, footprints, thickness):
    """Documented envelope only; no claim that manufacturer CAD was recovered."""
    footprint = next((part for part in footprints if part['footprint'] == 'Battery:BatteryHolder_Renata_SMTU2032-LF_1x2032'), None)
    drawing = path.parent / 'source-cad/SMTU2032-LF-drawing.pdf'
    if footprint is None or not drawing.is_file():
        return []
    gltf, raw = read_glb(path)
    if any(node.get('name') == footprint['ref'] for node in gltf['nodes']):
        return []
    binary = bytearray(raw)
    def attribute(values):
        binary.extend(b'\0' * (-len(binary) % 4))
        offset = len(binary);binary.extend(struct.pack('<'+'f'*len(values),*values))
        view = len(gltf['bufferViews']);gltf['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*4,'target':34962})
        accessor=len(gltf['accessors']);gltf['accessors'].append({'bufferView':view,'componentType':5126,'count':len(values)//3,'type':'VEC3','min':[min(values[i::3]) for i in range(3)],'max':[max(values[i::3]) for i in range(3)]})
        return accessor
    primitives=[]
    def solid(faces,color,metal):
        positions,normals=[],[]
        for face in faces:
            for i in range(1,len(face)-1):
                tri=[face[0],face[i],face[i+1]]
                a,b,c=tri;u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
                n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                length=math.sqrt(sum(x*x for x in n))
                if length<1e-10:continue
                for p in tri:positions.extend(x/1000 for x in p);normals.extend(x/length for x in n)
        material=len(gltf['materials']);gltf['materials'].append({'name':'dimensioned_renata_'+str(material),'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':color+[1],'metallicFactor':metal,'roughnessFactor':.55}})
        primitives.append({'attributes':{'POSITION':attribute(positions),'NORMAL':attribute(normals)},'material':material,'mode':4})
    def extrude(poly,height,bottom=0):
        a=[(x,bottom,z) for x,z in poly];b=[(x,bottom+height,z) for x,z in poly]
        return [list(reversed(a)),b]+[[a[i],a[(i+1)%len(a)],b[(i+1)%len(a)],b[i]] for i in range(len(a))]
    # KiCad's fabrication outline supplies the R11 profile and +/-8.050001
    # limits. The official drawing gives 28.5, 5.4, 2.6, 3.5 and 0.15 mm.
    # Keep only side-wall envelopes and solder tabs, omitting undocumented
    # spring detail. The 20 mm opening is the documented CR2032 envelope.
    faces=[]
    stops=sorted(set([-8.050001+i*16.100002/64 for i in range(65)]+[-3.5,3.5]))
    for sign in (-1,1):
        for za,zb in zip(stops,stops[1:]):
            outer=lambda z:14.25 if abs((za+zb)/2)<=3.5 else math.sqrt(121-z*z)
            inner=lambda z:math.sqrt(100-z*z)
            faces.extend(extrude([(sign*inner(za),za),(sign*outer(za),za),(sign*outer(zb),zb),(sign*inner(zb),zb)],5.4))
    solid(faces,[.89,.88,.83],0)
    faces=[]
    for x in (-14.7,14.7):faces.extend(extrude([(x-1.3,-1.75),(x+1.3,-1.75),(x+1.3,1.75),(x-1.3,1.75)],.15))
    solid(faces,[.68,.7,.71],1)
    mesh=len(gltf['meshes']);gltf['meshes'].append({'name':footprint['ref'],'primitives':primitives})
    angle=math.radians(footprint['atMm'][2] if len(footprint['atMm'])>2 else 0)
    backside = footprint['side'] == 'back'
    rotation = [math.cos(angle/2),0,-math.sin(angle/2),0] if backside else [0,math.sin(angle/2),0,math.cos(angle/2)]
    node=len(gltf['nodes']);gltf['nodes'].append({'name':footprint['ref'],'mesh':mesh,'translation':[footprint['atMm'][0]/1000,(.005 if backside else thickness-.005)/1000,footprint['atMm'][1]/1000],'rotation':rotation})
    gltf['nodes'][gltf['scenes'][gltf.get('scene',0)]['nodes'][0]].setdefault('children',[]).append(node)
    write_glb(path,gltf,binary)
    return [{'ref':footprint['ref'],'side':footprint['side'],'kind':'Dimensioned holder envelope and solder contacts; not manufacturer CAD','drawing':'source-cad/SMTU2032-LF-drawing.pdf','drawingHash':sha256(drawing),'sourceUrl':'https://www.renata.com/en/downloads/?product=smtu2032-lf&fileid=6a9833a4d49dfb7b550194fe0f','drawingNumber':'3.87600.446, revision 6','dimensionsMm':{'bodyLength':28.5,'height':5.4,'outerRadius':11,'cellDiameter':20,'contactPitch':29.4,'contactSize':[2.6,3.5,.15]},'detailScope':'Authored F.Fab side envelope and manufacturer-dimensioned solder tabs. Spring internals and retention details are intentionally omitted.'}]


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
    if core_index >= 3:
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
    unpopulated = False
    resolutions, missing, vrml, package_fallbacks = {}, [], {}, []
    for footprint in footprints:
        if unpopulated:
            continue
        for model in footprint["models"]:
            if model not in resolutions:
                audited_q4_fallback = slug == 'skylabs-telemetry' and footprint['ref'] == 'Q4' and model.endswith('/p200_SOT-23.stp') and libraries.standard
                audited_holder = slug == 'skylabs-telemetry' and footprint['footprint'] == 'Battery:BatteryHolder_Renata_SMTU2032-LF_1x2032' and (out / 'source-cad/SMTU2032-LF-drawing.pdf').is_file()
                # This original removable-drive reference was audited as absent.
                # Do not probe a disconnected F: volume on every rebuild.
                resolutions[model] = None if audited_q4_fallback or audited_holder else libraries.resolve(model, board)
                if audited_holder and libraries.standard:
                    exact_holder = libraries.standard / 'Battery.3dshapes/BatteryHolder_Renata_SMTU2032-LF_1x2032.step'
                    resolutions[model] = exact_holder if exact_holder.is_file() else None
                if audited_q4_fallback:
                    alternate = libraries.standard / 'Package_TO_SOT_SMD.3dshapes/SOT-23.step'
                    if alternate.is_file():
                        resolutions[model] = alternate
                        package_fallbacks.append({'ref': 'Q4', 'kind': 'KiCad package-library fallback; not recovered Diotec CAD', 'originalModel': 'p200_SOT-23.stp', 'sourceAlternate': '${KICAD6_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23.wrl (hidden in original footprint)', 'resolvedModel': 'Package_TO_SOT_SMD.3dshapes/SOT-23.step', 'sourceHash': sha256(alternate), 'package': 'SOT-23', 'manufacturerDatasheet': 'https://diotec.com/files/diotec/productfiles/datasheet/mmbt4403.pdf'})
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
            if unpopulated:
                command[-1:-1] = ["--include-tracks", "--include-zones"]
            result = subprocess.run(command, capture_output=True, text=True, timeout=600)
            if result.returncode:
                raise RuntimeError((result.stdout + result.stderr)[-2000:])
            general = child(tree, "general", [])
            registrations = register_manufacturer_models(out / "board.glb", footprints, resolutions, slug, float(child(general, 'thickness', [None,'1.6'])[1]))
            additions = append_literal_vrml_boxes(out / "board.glb", footprints, vrml, float(child(general, 'thickness', [None,'1.6'])[1]))
            authored_vrml = preserve_authored_vrml_meshes(out / "board.glb", footprints, board, libraries)
            dimensioned = append_dimensioned_renata(out / "board.glb", footprints, float(child(general,'thickness',[None,'1.6'])[1]))
            compaction = compact_source_geometry(out / 'board.glb') if slug.startswith('skylabs-') else None
            missing = [item for item in missing if item['ref'] not in {entry['ref'] for entry in dimensioned}]
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
        metadata["copperIncluded"] = unpopulated
        metadata["materialProperties"] = {role: next(material["pbrMetallicRoughness"] for material in gltf["materials"] if material.get("name") == name) for role, name in materials.items()}
        metadata["literalVrmlModels"] = additions
        metadata["authoredVrmlMeshes"] = authored_vrml
        metadata["dimensionedRepresentations"] = dimensioned
        metadata["modelRegistrations"] = registrations
        metadata['packageLibraryFallbacks'] = package_fallbacks
        if compaction:
            metadata['losslessCompaction'] = compaction
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
            plug_footprint = next(item for item in footprints if item['ref'] == 'P1')
            # The exact plug straddles the edge, so its contact-row midplane
            # belongs at the PCB midplane, not at the component top surface.
            # Its native mating-axis origin is 3.4 mm ahead of the footprint.
            plug_position = [plug_footprint['atMm'][0]-(bounds[0]+bounds[2])/2,(height[0]+height[1])/2,plug_footprint['atMm'][1]-(bounds[1]+bounds[3])/2-3.4]
            metadata['connector'] = {'modelUrl':'/assets/models/framework-esp32/framework-usbc.glb','node':'P1','ref':'P1','scaleToMillimetres':1000,'rotationRadians':[-math.pi/2,0,0],'positionBoardLocalMm':plug_position,'sourceHash':sha256(connector),'provenance':'Existing exact Molex 105444 geometry; actual P1 footprint XY and PCB contact-row midplane','registration':{'sourceFootprintAtMm':plug_footprint['atMm'],'nativeMatingAxisOffsetMm':-3.4,'seating':'Symmetric edge-mount contact rows centred on exported PCB core; prior top-surface placement lifted the connector by 0.445 mm'}}
            metadata['missingModels'] = [item for item in metadata['missingModels'] if item['ref'] != 'P1']
            entry = next(item for item in footprints if item['ref'] == 'P1')
            entry.update({'providedBy':'connector','modelExported':True,'boardModelExported':False})
            metadata['modelledComponentCount'] += 1
            enclosure = board.parents[3] / 'Mechanical/Printable/3D/ExpansionCard_SelfTapping.stl'
            (out / 'framework-logic-enclosure.stl').write_bytes(enclosure.read_bytes())
            holes = sorted((item for item in footprints if item['ref'] in ('H1', 'H2')), key=lambda item: item['ref'])
            if len(holes) != 2:
                raise ValueError('The Framework housing requires the two authored mounting holes')
            centres = [[round(item['atMm'][0]-(bounds[0]+bounds[2])/2, 6), round(item['atMm'][1]-(bounds[1]+bounds[3])/2, 6)] for item in holes]
            metadata['mechanics'] = {
                'enclosureUrl': '/assets/models/hardware/framework-logic-analyser/framework-logic-enclosure.stl',
                'translationMm': [0, -3.1, round(centres[0][1]+10.5, 6)],
                'holesMm': centres,
                'boardTopMm': metadata['thicknessMm'],
                'fastenerUrl': '/assets/models/framework-mechanics/framework-m2x3-screw.stl',
                'holeRefs': [item['ref'] for item in holes],
                'sourceFile': 'ExpansionCards-main/Mechanical/Printable/3D/ExpansionCard_SelfTapping.stl',
                'sourceSha256': sha256(enclosure),
                'sourceBossCentresMm': [[-11.3, 3.1, -10.5], [11.3, 3.1, -10.5]],
                'registration': 'Original Framework self-tapping housing; boss annuli at Y=3.1 mm seated at the unchanged PCB underside. Boss axes registered to the authored H1/H2 hole centres.',
                'fastenerProvenance': '/assets/models/framework-mechanics/framework-m2x3-screw.json',
                'attribution': 'Framework Computer Inc, CC BY 4.0. Original housing triangles and M2 x 3 screw CAD retained.',
            }
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
    libraries = Libraries(args.model_library + [destination / slug / 'source-cad' for slug in selected] + [destination / '_libraries'] + ([standard] if standard else []) + [source], standard)
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
