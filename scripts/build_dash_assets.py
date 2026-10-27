"""Export the archived Dash STL as an indexed, explodable glTF 2.0 asset.

Requires numpy. No KiCad/Blender installation or replacement geometry is used.
Usage: python scripts/build_dash_assets.py --stl SOURCE.stl --pcb SOURCE.kicad_pcb
Use the July 2025 PCB snapshot in the original project's PCB/ directory, which
matches the July 28 STL. The newer root PCB has different component positions.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = np.array([77.0, -119.0, .755])


def parse_sexpr(source):
    stack = []
    for token in re.findall(r'"(?:\\.|[^"\\])*"|\(|\)|[^\s()]+', source):
        if token == '(':
            stack.append([])
        elif token == ')':
            node = stack.pop()
            if stack:
                stack[-1].append(node)
            else:
                return node
        else:
            stack[-1].append(token[1:-1] if token.startswith('"') else token)
    raise ValueError('Incomplete KiCad file')


def entries(node, key):
    return [item for item in node if isinstance(item, list) and item and item[0] == key]


def footprints(path):
    result = {}
    for fp in entries(parse_sexpr(path.read_text(encoding='utf-8')), 'footprint'):
        properties = {item[1]: item[2] for item in entries(fp, 'property')}
        ref = properties.get('Reference', '')
        if ref == 'G***':
            continue
        at = [float(value) for value in entries(fp, 'at')[0][1:]]
        result[ref] = {'ref': ref, 'value': properties.get('Value', ''),
                       'footprint': fp[1], 'at': at,
                       'models': [item[1] for item in entries(fp, 'model')]}
    return result


def read_stl(path):
    source = path.read_bytes()
    if len(source) >= 84 and 84 + struct.unpack_from('<I', source, 80)[0] * 50 == len(source):
        dtype = np.dtype([('normal', '<f4', 3), ('vertices', '<f4', (3, 3)), ('attr', '<u2')])
        triangles = np.frombuffer(source, dtype=dtype, offset=84)['vertices'].astype(np.float64)
    else:
        values = re.findall(rb'vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)', source)
        triangles = np.asarray(values, dtype=np.float64).reshape(-1, 3, 3)
    if not len(triangles) or not np.isfinite(triangles).all():
        raise ValueError('STL has no finite triangle geometry')
    return triangles, hashlib.sha256(source).hexdigest()


def connected_islands(triangles):
    vertices, indices = np.unique(triangles.reshape(-1, 3), axis=0, return_inverse=True)
    faces = indices.reshape(-1, 3)
    parent = np.arange(len(vertices))
    ranks = np.zeros(len(vertices), dtype=np.int8)

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a, b):
        a, b = find(a), find(b)
        if a == b:
            return
        if ranks[a] < ranks[b]:
            a, b = b, a
        parent[b] = a
        if ranks[a] == ranks[b]:
            ranks[a] += 1

    for a, b, c in faces:
        union(a, b)
        union(a, c)
    labels = np.array([find(index) for index in range(len(vertices))])[faces[:, 0]]
    return [np.flatnonzero(labels == label) for label in np.unique(labels)]


def public_silkscreen(triangles):
    # The archived underside includes two full-name annotations and student
    # identifiers. Remove only their flat B.SilkS triangles from this public
    # derivative. Bounds are verified against the matching PCB text anchors.
    center = triangles.mean(1)
    underside_silk = np.all(np.abs(triangles[:, :, 2] + .075) < .00001, axis=1)
    lower_text = ((center[:, 0] > 59) & (center[:, 0] < 94.1) &
                  (center[:, 1] < -138.9) & (center[:, 1] > -140.7))
    upper_name = ((center[:, 0] > 59) & (center[:, 0] < 77.9) &
                  (center[:, 1] < -137.3) & (center[:, 1] > -138.95))
    omitted = underside_silk & (lower_text | upper_name)
    if not omitted.any():
        raise ValueError('Expected private annotation regions missing; review source before publishing')
    return triangles[~omitted], int(omitted.sum())


def identify_parts(triangles, islands, fps):
    # These anchors discriminate the matching July export from later revisions.
    for ref, expected in [('D3', (73.2, 99.8)), ('Q3', (71.0625, 102.8))]:
        if not np.allclose(fps[ref]['at'][:2], expected, atol=.001):
            raise ValueError('PCB does not match the archived STL: ' + ref)
    assignments = {}
    for indices in islands:
        coords = triangles[indices].reshape(-1, 3)
        lo, hi = coords.min(0), coords.max(0)
        center = (lo + hi) / 2
        if hi[2] <= 1.59:
            ref = 'board'
        elif abs(hi[2] - lo[2]) < .00001 and abs(hi[2] - 1.995) < .00001:
            # These 14 planar islands are the ESP32 module's edge contacts.
            if not (70.04 <= lo[0] <= hi[0] <= 88.06 and -142.70 <= lo[1] <= hi[1] <= -117.18):
                raise ValueError('Unexpected module contact geometry')
            ref = 'U3'
        else:
            distances = []
            for ref, fp in fps.items():
                if not fp['models']:
                    continue
                anchor = np.array([fp['at'][0], -fp['at'][1]])
                # Connector origins are pin 1, not geometric centers. Offsets
                # are verified against the actual STL bounds, in source axes.
                if ref == 'J2':
                    anchor += [0, -3.81]
                elif ref == 'BT1':
                    anchor += [1, -2.45]
                distances.append((np.linalg.norm(center[:2] - anchor), ref))
            distance, ref = min(distances)
            if distance > .001:
                raise ValueError(f'Unmatched physical island at {center}: nearest {ref}, {distance} mm')
        assignments.setdefault(ref, []).extend(indices.tolist())
    return {ref: np.array(indices) for ref, indices in assignments.items()}


MATERIALS = [
    ('Solder mask', [.035, .13, .085, 1], .05, .6),
    ('FR4 edge', [.23, .32, .17, 1], 0, .8),
    ('Exposed copper and pads', [.62, .39, .13, 1], .75, .34),
    ('Silkscreen', [.82, .85, .72, 1], 0, .8),
    ('Moulded package', [.045, .052, .048, 1], .05, .65),
    ('Tin and shield', [.55, .59, .59, 1], .8, .28),
    ('Ceramic body', [.43, .27, .13, 1], .05, .6),
    ('Connector housing', [.77, .77, .68, 1], 0, .6),
    ('Red LED', [.55, .06, .035, 1], 0, .38),
    ('Green LED', [.12, .42, .13, 1], 0, .38),
]


def material_faces(ref, faces, fp):
    xyz = faces.mean(1)
    lo, hi = faces.min(1), faces.max(1)
    material = np.full(len(faces), 4, dtype=np.int8)
    if ref == 'board':
        material[:] = 1
        material[(lo[:, 2] >= 1.509) | (hi[:, 2] <= .001)] = 2
        material[(np.abs(xyz[:, 2] - 1.56) < .001) | (np.abs(xyz[:, 2] + .05) < .001)] = 0
        material[(np.abs(xyz[:, 2] - 1.585) < .001) | (np.abs(xyz[:, 2] + .075) < .001)] = 3
    elif ref == 'U3':
        material[:] = 0
        material[(xyz[:, 2] > 2.25) & (xyz[:, 1] > -136.9)] = 5
        material[np.abs(xyz[:, 2] - 1.995) < .00001] = 2
    elif ref.startswith(('C', 'R', 'L')):
        # End terminals follow the source model's long axis.
        angle = np.deg2rad(fp['at'][2] if len(fp['at']) > 2 else 0)
        relative = xyz[:, :2] - [fp['at'][0], -fp['at'][1]]
        along = relative[:, 0] * np.cos(angle) - relative[:, 1] * np.sin(angle)
        span = np.ptp(faces.reshape(-1, 3), axis=0)[:2].max()
        material[:] = 6 if ref.startswith('C') else 4
        material[np.abs(along) > span * .34] = 5
    elif ref == 'BT1':
        material[:] = 7
        material[xyz[:, 2] < 1.7] = 5
    elif ref in ('J2', 'T1'):
        material[:] = 2
        material[(xyz[:, 2] >= 1.595) & (xyz[:, 2] <= 4.135)] = 4
    elif ref == 'LS1':
        material[:] = 4
        material[xyz[:, 2] < 2] = 5
    elif ref in ('D1', 'D2'):
        material[:] = 8 if ref == 'D1' else 9
        material[xyz[:, 2] < 1.9] = 5
    else:
        material[xyz[:, 2] < 1.88] = 5
    return material


def transform(coords):
    local = coords - ORIGIN
    return np.column_stack((local[:, 0], local[:, 2], -local[:, 1])).astype('<f4')


def group_for(ref):
    if ref == 'board':
        return 'board'
    if ref in {'U3', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22', 'R14', 'R15', 'R16'}:
        return 'controller'
    if ref in {'U4', 'Q1', 'Q2', 'J2', 'T1', 'LS1', 'C4', 'C5', 'C6', 'C13', 'C14', 'C15', 'C16', 'R1', 'R2', 'R3', 'R9', 'R10', 'R12'}:
        return 'interfaces'
    return 'power'


def write_glb(path, triangles, assignments, fps):
    gltf = {'asset': {'version': '2.0', 'generator': 'Dash source STL exporter'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'buffers': [], 'bufferViews': [], 'accessors': [], 'materials': []}
    for name, color, metallic, roughness in MATERIALS:
        gltf['materials'].append({'name': name, 'doubleSided': True,
                                  'pbrMetallicRoughness': {'baseColorFactor': color,
                                  'metallicFactor': metallic, 'roughnessFactor': roughness}})
    binary = bytearray()

    def accessor(array, component_type, shape, target):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        blob = array.tobytes()
        binary.extend(blob)
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob), 'target': target})
        acc = {'bufferView': view, 'componentType': component_type, 'count': len(array), 'type': shape}
        if shape == 'VEC3':
            acc.update(min=array.min(0).tolist(), max=array.max(0).tolist())
        gltf['accessors'].append(acc)
        return len(gltf['accessors']) - 1

    parts = []
    for ref in sorted(assignments, key=lambda key: (key != 'board', key)):
        faces = triangles[assignments[ref]]
        materials = material_faces(ref, faces, fps.get(ref))
        primitives = []
        for material in np.unique(materials):
            points, indices = np.unique(faces[materials == material].reshape(-1, 3), axis=0, return_inverse=True)
            points = transform(points)
            # Each material primitive is independently indexed; no triangles
            # are simplified or replaced. Privacy-only silkscreen omissions
            # happen before this stage. Omitting normals lets the
            # glTF renderer use flat face normals for the original CAD facets.
            index_type = '<u2' if len(points) <= 65535 else '<u4'
            position_id = accessor(points, 5126, 'VEC3', 34962)
            index_id = accessor(indices.astype(index_type), 5123 if index_type == '<u2' else 5125, 'SCALAR', 34963)
            primitives.append({'attributes': {'POSITION': position_id}, 'indices': index_id, 'material': int(material)})
        mesh_index = len(gltf['meshes'])
        gltf['meshes'].append({'name': 'mesh_' + ref, 'primitives': primitives})
        node_index = len(gltf['nodes'])
        node_name = 'part_' + ref
        group = group_for(ref)
        gltf['nodes'].append({'name': node_name, 'mesh': mesh_index,
                               'extras': {'reference': ref, 'group': group}})
        gltf['scenes'][0]['nodes'].append(node_index)
        part_points = transform(faces.reshape(-1, 3))
        parts.append({'node': node_name, 'reference': ref, 'group': group,
                      'value': fps[ref]['value'] if ref in fps else 'PCB with copper, mask and silkscreen',
                      'triangles': len(faces),
                      'bounds': {'min': part_points.min(0).tolist(), 'max': part_points.max(0).tolist()}})
    while len(binary) % 4:
        binary.append(0)
    gltf['buffers'] = [{'byteLength': len(binary)}]
    document = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    document += b' ' * (-len(document) % 4)
    size = 12 + 8 + len(document) + 8 + len(binary)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, size) + struct.pack('<I4s', len(document), b'JSON') + document + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stl', type=Path, required=True)
    parser.add_argument('--pcb', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/models/dash')
    args = parser.parse_args()
    fps = footprints(args.pcb)
    triangles, digest = read_stl(args.stl)
    original_triangle_count = len(triangles)
    triangles, omitted = public_silkscreen(triangles)
    islands = connected_islands(triangles)
    assignments = identify_parts(triangles, islands, fps)
    if sum(len(indices) for indices in assignments.values()) != len(triangles):
        raise ValueError('Source triangles were lost during assignment')
    args.output.mkdir(parents=True, exist_ok=True)
    model_path = args.output / 'dash-prototype.glb'
    parts = write_glb(model_path, triangles, assignments, fps)
    group_info = [
        ('board', 'The board', 'The original PCB, copper, solder mask and silkscreen stay together.'),
        ('power', 'Power', 'Battery connection, protection, regulator and power-support components.'),
        ('controller', 'Control', 'The ESP32 module and supporting components for control and motion sensing.'),
        ('interfaces', 'Connections', 'USB-to-serial bridge, display and touch headers, speaker connector and supporting components.'),
    ]
    points = transform(triangles.reshape(-1, 3))
    missing = sorted(ref for ref in fps if ref not in assignments and fps[ref]['models'])
    manifest = {
        'model': '/assets/models/dash/dash-prototype.glb', 'units': 'millimetres',
        'coordinateSystem': 'Y-up; board centered on X/Z, all part nodes share assembly coordinates',
        'bounds': {'min': points.min(0).tolist(), 'max': points.max(0).tolist(), 'size': np.ptp(points, axis=0).tolist()},
        'groups': [{'id': key, 'label': label, 'description': desc,
                    'nodes': [part['node'] for part in parts if part['group'] == key]}
                   for key, label, desc in group_info],
        'parts': parts,
        'source': {
            'label': 'Archived prototype PCB · July 2025',
            'stl': args.stl.name, 'stlExportDate': '2025-07-28', 'stlSha256': digest,
            'pcb': 'PCB/' + args.pcb.name,
            'pcbSha256': hashlib.sha256(args.pcb.read_bytes()).hexdigest(),
            'boardDimensionsMm': [45.2, 45.2, 1.6], 'boardCornerRadiusMm': 2,
            'sourceTriangles': original_triangle_count, 'triangles': len(triangles), 'connectedIslands': len(islands),
            'privacyOmittedTriangles': omitted,
            'componentMapping': 'July PCB footprint positions; D3 and Q3 positions distinguish this from later revisions. Connector model origin offsets verified against STL bounds.',
            'transform': {'sourceOrigin': ORIGIN.tolist(), 'mapping': '[x-77, z-0.755, -(y+119)]'},
            'geometry': 'Source STL triangles retained except underside full-name and student-identifier annotations removed for the public derivative. No replacement component solids or enclosure added. Component packages and their contacts move together.',
            'materials': 'Illustrative material finishes assigned to source triangles; STL carries no original color information. Colors do not claim photographed finishes.',
            'limitations': 'Archived PCB export, not a complete mechanical device. Enclosure, external display, speaker and battery are absent. Some footprint packages are absent in the source STL; their board pads remain visible.',
            'footprintsWithMissingModelGeometry': missing,
            'footprintsWithoutAssignedModels': sorted(ref for ref, fp in fps.items() if not fp['models']),
            'revisionNote': 'The September 2025 PCB is newer than this July export and is not represented by this model.'
        }
    }
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Wrote {model_path.name}: {model_path.stat().st_size:,} bytes, {len(parts)} complete part nodes, {len(triangles):,} source triangles')
    print('Unrepresented package meshes:', ', '.join(missing))


if __name__ == '__main__':
    main()
