"""Build bounded hardware illustrations around the retained Mame P2 datums.
SPDX-License-Identifier: MIT
Uses numeric project dimensions, never vendor CAD. See hardware-provenance.json.
Requires CadQuery and NumPy. Run: python scripts/kiku-hardware/build.py
"""
from pathlib import Path
import hashlib,json,gzip,math
import numpy as np
import cadquery as cq
SITE=Path(__file__).resolve().parents[2]; OUT=SITE/'assets/models/kiku-hardware';OUT.mkdir(exist_ok=True,parents=True)
blob=bytearray();parts=[];items=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def pack(a,dtype,n):
 a=np.ascontiguousarray(a,dtype=dtype);offset=len(blob);blob.extend(a.tobytes());return dict(byteOffset=offset,byteLength=a.nbytes,count=a.size//n,itemSize=n)
def mesh(id,group,shape,color,explode,**style):
 # Tessellate faces separately to preserve CAD creases, without a vendor mesh.
 verts=[];normals=[];indices=[]
 for face in shape.Faces():
  vv,ff=face.tessellate(.10,.12)
  if not vv or not ff:continue
  v=np.array([p.toTuple() for p in vv]);f=np.array(ff);n=np.zeros_like(v);tn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
  for i in range(3):np.add.at(n,f[:,i],tn)
  lengths=np.linalg.norm(n,axis=1);assert (lengths>1e-12).all();n/=lengths[:,None]
  indices.extend((f+len(verts)).tolist());verts.extend(v.tolist());normals.extend(n.tolist())
 v=np.array(verts);entry=dict(id=id,group=group,color=color,explode=explode,roughness=.5,metalness=0,opacity=1,bounds=[v.min(0).tolist(),v.max(0).tolist()],triangles=len(indices));entry.update(style)
 entry.update(position=pack(v,'<f4',3),normal=pack(normals,'<f4',3),index=pack(indices,'<u4',1));parts.append(entry)
def box(x,y,z,w,h,d):return cq.Solid.makeBox(w,h,d,cq.Vector(x,y,z))
def cyl(x,y,z,r,h,axis=(0,0,1)):return cq.Solid.makeCylinder(r,h,cq.Vector(x,y,z),cq.Vector(*axis))
def rounded(x,y,z,w,h,d,r):return cq.Workplane('XY').rect(w,h).extrude(d).edges('|Z').fillet(r).val().translate((x,y,z))
def item(id,name,color,description):
 p=[q for q in parts if q['group']==id];lo=np.min([q['bounds'][0] for q in p],0);hi=np.max([q['bounds'][1] for q in p],0);items.append(dict(id=id,name=name,color=color,description=description,fidelity='Documented dimensions · reconstructed packaging',bounds=[lo.tolist(),hi.tolist()],size=(hi-lo).tolist()))
# Nominal cell from Mechanical/parameters.json. No invented capacity/branding/leads.
mesh('battery_pouch','battery',rounded(30,70,-15.2,34,50,10,.6),'#b7c6d2',[0,0,-31],metalness=.58,roughness=.37)
item('battery','Battery','#b7c6d2','Nominal 34 × 50 × 10 mm cell in the original reference position, inside the enlarged P2 pocket. Rounded display envelope; leads, protection board and swelling allowance remain unverified')
# Exact envelope dimensions and source mount. Color separation is illustrative.
mesh('speaker_rim','speaker',cyl(18,23,-14.8,10,5.1).cut(cyl(18,23,-14.81,8.65,5.12)),'#869292',[0,-8,-34],metalness=.65,roughness=.35)
# Recessed faces are material-only disks, inside the published body dimensions.
mesh('speaker_face','speaker',cyl(18,23,-14.8,8.65,5.1),'#222b2e',[0,-8,-34],roughness=.85)
item('speaker','Speaker','#869292','C50387209 nominal Ø20 × 5.1 mm envelope, facing the rear grille at the retained P2 retainer centre. Surface colors are illustrative; diaphragm and magnet details are not manufacturer CAD')
# P2 cradle centre: source 82.88 + 0.615 mm derived from the retained P2 cradle.
mesh('screen_body','screen',box(4.11,65.395,10.45,51.8,36.2,2.05),'#485d65',[0,0,26],metalness=.25,roughness=.45)
# Lens has a reverse mask. An aperture and lightly transparent pane reveal the
# real renderer snapshot beneath; no simulated glass thickness is claimed.
lens=rounded(30.01,83.495,14,54,37.8,1,3.2)
window=rounded(27.35,83.495,13.9,41.6,31.4,1.2,.35)
mesh('screen_lens_mask','screen',lens.cut(window),'#14262a',[0,0,58],roughness=.2)
mesh('screen_lens_clear','screen',window.intersect(lens),'#c8e3e8',[0,0,58],opacity=.09,roughness=.12)
# Active area 40.8 × 30.6, 2.66 mm left of body centre, from project report.
v=np.array([[6.95,68.195,12.51],[47.75,68.195,12.51],[47.75,98.795,12.51],[6.95,98.795,12.51]])
p=dict(id='screen_pixels',group='screen',color='#ffffff',explode=[0,0,26],texture='/assets/models/kiku-hardware/screen.png',unlit=True,opacity=1,roughness=1,metalness=0,bounds=[v.min(0).tolist(),v.max(0).tolist()],triangles=2)
p.update(position=pack(v,'<f4',3),normal=pack([[0,0,1]]*4,'<f4',3),uv=pack([[0,0],[1,0],[1,1],[0,1]],'<f4',2),index=pack([[0,1,2],[0,2,3]],'<u4',1));parts.append(p)
item('screen','Screen + lens','#485d65','HS20HS072RX 51.8 × 36.2 × 2.05 mm body, 40.8 × 30.6 mm active area and 54 × 37.8 × 1 mm lens. P2 optical centre follows the retained cradle, 0.615 mm above the older source datum. Image is a static capture of the real firmware renderer; flex and mating fit remain unverified')
# P2 channel is a measured radius 5.1 mm about X65/Z-12.1. Its hinge relief
# spans Y25.4..37.6; original P2 overall envelope places the upper tip at Y119.
# The missing hinge/rod split is reconstructed, NOT the supplier 105 mm length.
mesh('antenna_base','antenna',cyl(65,25.4,-12.1,4.5,12.2,(0,1,0)),'#707e83',[0,0,-47],metalness=.8,roughness=.3)
mesh('antenna_rod','antenna',cyl(65,37.6,-12.1,4.5,81.4,(0,1,0)),'#bdc6c8',[0,0,-47],metalness=.86,roughness=.26)
item('antenna','Antenna','#bdc6c8','Ø9 mm collapsed antenna packaging reconstruction, aligned to the P2 right-side channel. Visible hinge/rod split is inferred from retained shell clearances and the P2 envelope; it is not manufacturer-exact geometry or a measured 105 mm collapsed assembly')
# Preserve independently auditable binary offsets, and compress for network use.
binary=bytes(blob);(OUT/'hardware.bin').write_bytes(binary);gz=gzip.compress(binary,compresslevel=9,mtime=0);(OUT/'hardware.bin.gz').write_bytes(gz)
m=dict(schema='kiku-hardware-envelope-v1',revision='Mame P2 browser packaging reconstruction',units='millimetres',coordinateSystem={'x':'right','y':'up','z':'front'},binary='hardware.bin',binaryBytes=len(binary),binarySha256=sha(binary),binaryGzip='hardware.bin.gz',binaryGzipSha256=sha(gz),partCount=len(parts),itemCount=len(items),triangles=sum(p['triangles'] for p in parts),parts=parts,items=items)
(OUT/'hardware.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps({k:m[k] for k in ['partCount','itemCount','triangles','binaryBytes']},indent=2))
