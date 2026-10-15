"""Independent regression verification of Kiku populated PCB packed browser assets.
Usage: python verify_assets.py [assets-dir] [public-kiku-source-dir]
Only standard Python and NumPy are required. Does not write to the source checkout.
"""
from pathlib import Path
import sys,json,hashlib,re,gzip,math
import numpy as np
ROOT=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT.parents[1]/'assets/models/kiku-pcb'
SRC=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/tmp/kiku-source')
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((OUT/'pcb.json').read_text());pr=json.loads((OUT/'pcb-provenance.json').read_text());b=(OUT/m['binary']).read_bytes()
assert sha(b)==m['binarySha256'] and len(b)==m['binaryBytes']
assert gzip.decompress((OUT/m['binaryGzip']).read_bytes())==b
assert sha((OUT/m['binaryGzip']).read_bytes())==m['binaryGzipSha256']
assert m['units']=='millimetres' and m['componentCount']==133
assert m['counts']==pr['counts']=={'footprints':142,'modelReferences':133,'officialLibraryMeshes':111,'vendorEnvelopeProxies':21,'unverifiedAllowances':1,'footprintsWithoutModel':9}
for rel,expected in pr['generatedFrom'].items():assert sha((SRC/rel).read_bytes())==expected,(rel,'source hash')
# Parse actual source independently, never trust historical metadata hashes.
def parse(text):
 tokens=re.findall(r'"(?:[^"\\]|\\.)*"|\(|\)|[^\s()]+',text);stack=[];root=None
 for t in tokens:
  if t=='(':
   a=[]
   if stack:stack[-1].append(a)
   stack.append(a)
  elif t==')':
   a=stack.pop()
   if not stack:root=a
  else:stack[-1].append(json.loads(t) if t.startswith('"') else t)
 return root
def children(a,k):return [x for x in a if isinstance(x,list) and x and x[0]==k]
def child(a,k):return next(iter(children(a,k)),None)
board=parse((SRC/'Walkman - Blobject.kicad_pcb').read_text())
data=json.loads((SRC/'Mechanical/reference/board_datums.json').read_text());d={f['ref']:f for f in data['footprints']}
actual={}
for f in children(board,'footprint'):
 ref=next(p[2] for p in children(f,'property') if p[1]=='Reference');at=child(f,'at');models=[]
 for mm in children(f,'model'):
  rec={'path':mm[1]}
  for key in ['offset','scale','rotate']:
   node=child(mm,key);rec['rotation' if key=='rotate' else key]=[float(v) for v in child(node,'xyz')[1:]]
  models.append(rec)
 actual[ref]={'xy':[float(at[1]),float(at[2])],'angle':float(at[3]) if len(at)>3 else 0,'layer':child(f,'layer')[1],'models':models}
assert set(actual)==set(d)
for ref,f in actual.items():
 for key in ['xy','angle','layer','models']:assert f[key]==d[ref][key],(ref,key)
provenance={c['ref']:c for c in pr['components']};assert set(provenance)=={r for r,f in actual.items() if f['models']}
env={e['ref']:e for e in json.loads((SRC/'Mechanical/reference/component_envelopes.json').read_text())}
# Reconstruct component bounds directly from packed triangles using unambiguous ranges.
component_vertices={r:[] for r in provenance};count_triangles=0
for p in m['parts']:
 assert p['group']=='pcb' and p['explode']==[0,0,0]
 assert re.fullmatch('#[0-9a-fA-F]{6}',p['color']) and 0<=p['opacity']<=1 and 0<=p['roughness']<=1 and 0<=p['metalness']<=1
 def array(k,dt):
  f=p[k];assert f['byteOffset']%4==0 and f['byteOffset']+f['byteLength']<=len(b)
  a=np.frombuffer(b,dtype=dt,count=f['count']*f['itemSize'],offset=f['byteOffset']).reshape(-1,f['itemSize'])
  assert a.nbytes==f['byteLength'];return a
 pos=array('position','<f4');normal=array('normal','<f4');idx=array('index','<u4').reshape(-1,3)
 assert np.isfinite(pos).all() and np.isfinite(normal).all() and idx.max()<len(pos)
 assert np.allclose(np.linalg.norm(normal,axis=1),1,atol=1e-4)
 assert np.allclose([pos.min(0),pos.max(0)],p['bounds'],atol=1e-5)
 assert len(idx)==p['triangles'];count_triangles+=len(idx)
 for segment in pr['componentTriangleRangesByMesh'].get(p['id'],[]):
  first=segment['firstTriangle'];end=first+segment['triangleCount'];assert 0<=first<end<=len(idx)
  component_vertices[segment['ref']].append(pos[idx[first:end]].reshape(-1,3))
assert count_triangles==m['triangles'] and len(m['parts'])==m['partCount']
maxerr=0
for ref,record in provenance.items():
 assert component_vertices[ref],ref
 points=np.concatenate(component_vertices[ref]);bounds=np.r_[points.min(0),points.max(0)]
 assert np.allclose(bounds,record['bounds'],atol=1e-5),(ref,'packed bound mismatch')
 assert np.allclose(bounds,env[ref]['bounds'],atol=1e-4),(ref,'reviewed envelope mismatch')
 maxerr=max(maxerr,float(np.max(np.abs(bounds-np.array(env[ref]['bounds'])))))
 f=actual[ref];place=record['sourcePlacement'];assert place['pcbXY']==f['xy'] and place['footprintAngleDegrees']==f['angle'] and place['layer']==f['layer']
 mod=f['models'][0];assert record['sourceExpression']==mod['path']
 if record['fidelity']=='official-library-model':
  assert record['librarySource']['release']=='9.0.2' and record['librarySource']['available']
  assert re.fullmatch('[0-9a-f]{64}',record['librarySource']['sha256'])
 else:assert record['fidelity']==('unverified-source-allowance' if ref=='D3' else 'source-envelope-proxy')
assert 'design' in (OUT/'KICAD-LIBRARY-LICENSE.md').read_text().lower()
assert (OUT/'CERN-OHL-P-2.0.txt').is_file()
print(json.dumps({'result':'PASS','actualSourceFootprints':len(actual),'actualSourceModels':len(provenance),'placementsMatchCurrentPCB':True,'packedComponentBoundsMatchRecordedBounds':True,'maximumPackedEnvelopeErrorMm':maxerr,'binaryBytes':len(b),'compressedBytes':(OUT/m['binaryGzip']).stat().st_size,'materialMeshes':len(m['parts']),'triangles':count_triangles},indent=2))
