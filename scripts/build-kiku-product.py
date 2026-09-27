"""Copy/tessellate Kiku P2's assembled source parts without altering the source.

Requires cadquery-ocp. STL geometry retains the source mechanical millimetres.
The viewer applies a single common transform to match the PCB export.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

from OCP.BRep import BRep_Builder
from OCP.BRepTools import BRepTools
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.TopoDS import TopoDS_Shape
from OCP.StlAPI import StlAPI_Writer

PARTS = [
    ('front_shell', 'Front shell', [.85,.87,.75], 47),
    ('rear_shell', 'Rear shell', [.29,.39,.34], -47),
    ('lens', 'Display lens', [.065,.115,.12], 65),
    ('button_left', 'Left button', [.94,.49,.20], 47),
    ('button_right', 'Right button', [.8,.82,.65], 47),
    ('encoder_knob', 'Encoder knob', [.2,.32,.25], 47),
    ('stand_frame', 'Folding stand', [.22,.34,.28], -61),
    ('display_carrier', 'Display carrier', [.74,.79,.67], 26),
    ('battery_guard', 'Battery guard', [.63,.7,.58], -12),
    ('speaker_retainer', 'Speaker retainer', [.59,.62,.58], -25),
    ('REF_BATTERY_34x50x10', 'Battery envelope', [.43,.62,.76], -25),
    ('REF_LCD_envelope', 'LCD envelope', [.1,.22,.23], 26),
    ('REF_SPEAKER_C50387209', 'Speaker envelope', [.59,.62,.58], -25),
]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_root', type=Path)
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[1]
    source = args.source_root / 'Mechanical/exports/P2'
    output = repository / 'assets/models/kiku-p2'
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for name, label, colour, displacement in PARTS:
        original = source / (name + '.stl')
        if not original.exists():
            original = source / (name + '.brep')
        before = digest(original)
        target = output / (name + '.stl')
        if original.suffix == '.stl':
            shutil.copyfile(original, target)
        else:
            shape = TopoDS_Shape()
            if not BRepTools.Read_s(shape, str(original), BRep_Builder()):
                raise ValueError(f'Could not read {original.name}')
            BRepMesh_IncrementalMesh(shape, .12, False, .16, True)
            writer = StlAPI_Writer()
            writer.ASCIIMode = False
            if not writer.Write(shape, str(target)):
                raise ValueError(f'Could not tessellate {original.name}')
        assert before == digest(original), f'Source changed: {original}'
        records.append({'ref': name, 'value': label, 'file': '/assets/models/kiku-p2/' + target.name,
                        'colour': colour, 'explodeMm': displacement,
                        'source': 'Mechanical/exports/P2/' + original.name, 'sourceHash': before})
    metadata = {'kind':'kiku-p2', 'boardManifest':'/assets/models/hardware/kiku/assembly.json',
                'unitsMm':105, 'mechanicalToBoard':{'rotationX':-1.5707963267948966,'translationMm':[-30,0,52.5]},
                'parts':records, 'sourceReport':'Mechanical/P2_DESIGN_REPORT.md',
                'notes':['All source parts retain their assembled coordinates.',
                         'Colours and explosion distances follow Mechanical/scripts/render_p2.py.',
                         'Battery, speaker and LCD are source-authored fit envelopes.',
                         'P2 is a mechanical revision; physical fit qualification remains.']}
    (output / 'assembly.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(records)} source mechanical parts; all source hashes unchanged.')

if __name__ == '__main__':
    main()
