"""Verify packed hardware bounds and retained-P2 mount evidence (NumPy only).
Surface screening is sampled visual-CAD evidence, not a tolerance/fit certificate.
"""
from pathlib import Path
import json,hashlib,gzip
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/models/kiku-hardware'
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((OUT/'hardware.json').read_text());b=(OUT/'hardware.bin').read_bytes()
assert len(b)==m['binaryBytes'] and sha(b)==m['binarySha256']
assert gzip.decompress((OUT/'hardware.bin.gz').read_bytes())==b
assert sha((OUT/'hardware.bin.gz').read_bytes())==m['binaryGzipSha256']
def unpack(p,b,k,t):
 a=p[k];assert a['byteOffset']%4==0 and a['byteOffset']+a['byteLength']<=len(b)
 return np.frombuffer(b,t,a['count']*a['itemSize'],a['byteOffset']).reshape(-1,a['itemSize'])
for p in m['parts']:
 v=unpack(p,b,'position','<f4');n=unpack(p,b,'normal','<f4');i=unpack(p,b,'index','<u4').reshape(-1,3)
 assert np.isfinite(v).all() and np.isfinite(n).all() and i.max()<len(v)
 assert np.allclose(np.linalg.norm(n,axis=1),1,atol=1e-4)
 assert np.allclose([v.min(0),v.max(0)],p['bounds'],atol=1e-5)
 assert len(i)==p['triangles']
assert m['itemCount']==4 and set(i['id'] for i in m['items'])=={'battery','antenna','speaker','screen'}
p={p['id']:p for p in m['parts']}
assert np.allclose(p['battery_pouch']['bounds'],[[13,45,-15.2],[47,95,-5.2]],atol=.002)
assert np.allclose(p['screen_body']['bounds'],[[4.11,65.395,10.45],[55.91,101.595,12.5]],atol=.002)
assert np.allclose(p['speaker_rim']['bounds'],[[8,13,-14.8],[28,33,-9.7]],atol=.015)
assert np.allclose(p['antenna_rod']['bounds'],[[60.5,37.6,-16.6],[69.5,119,-7.6]],atol=.003)
# Independently re-derive mount dimensions from original, untouched P2 binary.
e=json.loads((ROOT/'assets/models/kiku/assembly.json').read_text());eb=(ROOT/'assets/models/kiku/assembly.bin').read_bytes();ep={p['id']:p for p in e['parts']}
assert sha(eb)==e['binarySha256']=='2d84ade42f7dba51397fd61a937bd79031605cd42291d6fdcdb9c0fbedd4f849'
r=unpack(ep['rear_shell'],eb,'position','<f4');q=np.unique(r[(abs(r[:,1]-112)<1e-4)&(r[:,0]>59.89)&(r[:,0]<60)&(r[:,2]>-17.3)&(r[:,2]<-6.9)],axis=0).astype(float)
c=np.linalg.lstsq(np.c_[2*q[:,0],2*q[:,2],np.ones(len(q))],q[:,0]**2+q[:,2]**2,rcond=None)[0];radius=float(np.sqrt(c[2]+sum(c[:2]**2)))
assert np.allclose(c[:2],[65,-12.1],atol=.002) and abs(radius-5.1)<.002
cradle=(np.array(ep['display_carrier']['bounds'])[0,1]+np.array(ep['display_carrier']['bounds'])[1,1])/2
assert abs(cradle-83.495)<1e-4
# Full-open display stays with its cradle, behind the detached front shell.
assert p['screen_body']['explode']==p['screen_pixels']['explode']==ep['display_carrier']['explode']
assert p['screen_pixels']['bounds'][1][2]+p['screen_pixels']['explode'][2] < ep['front_shell']['bounds'][0][2]+ep['front_shell']['explode'][2]
# Hardware sits between the original PCB and documented support depths.
assert p['battery_pouch']['bounds'][1][2]<ep['battery_guard']['bounds'][0][2]
assert p['speaker_rim']['bounds'][1][2]<ep['speaker_retainer']['bounds'][0][2]
print(json.dumps({'result':'PASS','hardwareGroups':m['itemCount'],'renderMeshes':m['partCount'],'originalEnclosureUnchanged':True,'screenCradleCentreY':cradle,'antennaChannelCentreXZ':c[:2].tolist(),'antennaChannelRadius':radius,'scope':'Packed assets, source nominal bounds and retained mount datums. Does not establish manufacture, mechanical tolerance or RF/acoustic performance.'},indent=2))
