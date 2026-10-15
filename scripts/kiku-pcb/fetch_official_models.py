"""Read only: download exact official KiCad 9.0.2 library paths referenced by Kiku."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, urllib.request, urllib.parse, hashlib, argparse
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,required=True)
parser.add_argument('--work-root',type=Path,required=True)
args=parser.parse_args();ROOT=args.work_root;ROOT.mkdir(parents=True,exist_ok=True)
DATA=json.loads((args.source_root/'Mechanical/reference/board_datums.json').read_text())
BASE='https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/9.0.2/'
paths=sorted(set(m['path'].split('}/',1)[1] for f in DATA['footprints'] for m in f['models'] if 'KICAD9_3DMODEL_DIR' in m['path']))
def fetch(p):
    target=ROOT/'kicad-models'/p; target.parent.mkdir(parents=True,exist_ok=True)
    url=BASE+urllib.parse.quote(p)
    try:
        if not target.exists():
            with urllib.request.urlopen(url,timeout=60) as r: b=r.read()
            if p.endswith('.step') and not b.startswith(b'ISO-10303-21'):raise ValueError('Invalid STEP body')
            target.write_bytes(b)
        b=target.read_bytes()
        row={'path':p,'url':url,'release':'9.0.2','sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'available':True}
    except Exception as e:row={'path':p,'url':url,'release':'9.0.2','available':False,'error':str(e)}
    print(row,flush=True);return row
with ThreadPoolExecutor(max_workers=8) as pool: rows=list(pool.map(fetch,paths+['LICENSE.md']))
(ROOT/'official-model-sources.json').write_text(json.dumps(rows,indent=2)+'\n')
