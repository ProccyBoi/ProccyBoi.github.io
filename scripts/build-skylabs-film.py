"""Source-derived Solarfilm envelopes and isolated sensor solid (no CAD resizing)."""
import json,struct,gzip,importlib.util,sys,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/models/aircraft/skylabs-competition'
b=(OUT/'assembly.glb').read_bytes();size=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+size]);binary=b[28+size:]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];return np.frombuffer(binary,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[a['componentType']],offset=v.get('byteOffset',0)+a.get('byteOffset',0),count=a['count']*{'VEC3':3,'SCALAR':1}[a['type']]).reshape((a['count'],-1)).copy()
world={}
def visit(i,parent):
 n=g['nodes'][i];m=np.eye(4)
 if 'matrix' in n:m=np.array(n['matrix']).reshape(4,4).T
 else:
  if 'rotation' in n:m[:3,:3]=Rotation.from_quat(n['rotation']).as_matrix()
  m[:3,:3]=m[:3,:3]@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0])
 world[i]=parent@m
 for c in n.get('children',[]):visit(c,world[i])
for i in g['scenes'][0]['nodes']:visit(i,np.eye(4))
def points(i):
 n=g['nodes'][i];arr=[]
 if 'mesh' in n:
  for p in g['meshes'][n['mesh']]['primitives']:
   v=accessor(p['attributes']['POSITION']);arr.append(v@world[i][:3,:3].T+world[i][:3,3])
 for c in n.get('children',[]):arr.append(points(c))
 return np.concatenate(arr) if arr else np.empty((0,3))
def canonical(v):
 return np.column_stack((.46381582-v[:,1],v[:,2]-.08375,.28518418-v[:,0]))
panels=[]
def panel(name,rows,normal,axis,blue=False,short=False):
 rows=np.array(rows);nr,nc,_=rows.shape;v=rows.reshape(-1,3);uv=[];indices=[];blueidx=[]
 for r in range(nr):
  for c in range(nc):uv.extend([c/(nc-1),r/(nr-1)])
 for r in range(nr-1):
  for c in range(nc-1):
   a=r*nc+c;idx=[a,a+1,a+nc,a+1,a+nc+1,a+nc]
   target=blueidx if blue or ('wing' in name and np.mean(v[idx,0])<.46381582-.145 and (np.mean(v[idx,2])>.28518418+.168 or np.mean(v[idx,2])<.28518418-.73836836)) else indices
   target.extend(idx)
 for color,ix in [('white',indices),('blue',blueidx)]:
  if ix:panels.append(dict(name=name+'-'+color,positions=np.round(v,8).reshape(-1).tolist(),uv=np.round(uv,6).tolist(),indices=ix,normal=normal,axis=axis,shortAxisPeel=short,colour=color,kind='wrap'))
def extrude(name,i):
 p=points(i);profile=p[:,1:3];h=ConvexHull(profile);poly=profile[h.vertices];lead=np.argmin(poly[:,0]);trail=np.argmax(poly[:,0]);paths=[]
 for step in [1,-1]:
  path=[];j=lead
  while True:
   path.append(poly[j])
   if j==trail:break
   j=(j+step)%len(poly)
  path=np.array(path);length=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))];samples=np.linspace(0,length[-1],65);path=np.column_stack([np.interp(samples,length,path[:,k]) for k in [0,1]])
  centre=profile.mean(axis=0);delta=path-centre;path+=delta/np.linalg.norm(delta,axis=1)[:,None]*.00045;paths.append(path)
 spans=np.linspace(p[:,0].min()-.0003,p[:,0].max()+.0003,25)
 for side,path in enumerate(paths):
  rows=[canonical(np.column_stack((np.full(len(path),x),path))) for x in spans]
  normal=[0,1 if path[:,1].mean()>profile[:,1].mean() else -1,0]
  panel(name+str(side),rows,normal,[0,0,1],blue=name.startswith('tail'))
 # Closed foil ends, also authored skin. Flat tessellated caps use same outline.
 for end,x in enumerate([spans[0],spans[-1]]):
  boundary=canonical(np.column_stack((np.full(len(poly),x),poly)));centre=boundary.mean(axis=0);v=np.vstack((centre,boundary));ix=[]
  for j in range(len(poly)):ix.extend([0,j+1,(j+1)%len(poly)+1])
  panels.append(dict(name=name+'-cap-'+str(end),positions=v.reshape(-1).tolist(),indices=ix,normal=[0,0,1 if end==0 else -1],axis=[0,0,1],colour='blue' if name.startswith('tail') else 'white',kind='cap'))
for name,i in [('wing-left',16),('wing-right',42),('tail-left',96),('tail-right',114)]:extrude(name,i)
# Fuselage follows the existing floor, sides and roof envelope, not a new fuselage.
x0,x1=.033-.0005,.699+.0005;y0,y1=-.08375-.0005,.04125+.0005;z0,z1=-.0505,.0505
for y,sign in [(y0,-1),(y1,1)]:panel('fuselage-'+str(sign),[[[x,y,z] for z in np.linspace(z0,z1,33)] for x in np.linspace(x0,x1,49)],[0,sign,0],[1,0,0],short=True)
for z,sign in [(z0,-1),(z1,1)]:panel('fuselage-side-'+str(sign),[[[x,y,z] for y in np.linspace(y0,y1,33)] for x in np.linspace(x0,x1,49)],[0,0,sign],[1,0,0],short=True)
for x,sign in [(x0,-1),(x1,1)]:panel('fuselage-end-'+str(sign),[[[x,y,z] for z in np.linspace(z0,z1,25)] for y in np.linspace(y0,y1,25)],[sign,0,0],[0,1,0],short=True)
# Vertical tail convex envelope retains the actual outline and local thickness.
for region,source_index in [('vertical-tail',78),('endplate-left',132),('endplate-right',133)]:
 p=np.unique(np.round(canonical(points(source_index)),6),axis=0);h=ConvexHull(p);groups={}
 for face,equation in zip(h.simplices,h.equations):
  normal=equation[:3];key=(int(np.argmax(abs(normal))),1 if normal[np.argmax(abs(normal))]>0 else -1);groups.setdefault(key,[]).append(face)
 for (axis,sign),faces in groups.items():
  normal=[0,0,0];normal[axis]=sign
  used=np.unique(np.array(faces).reshape(-1));lookup={v:i for i,v in enumerate(used)}
  panels.append(dict(name=region+'-'+str(axis)+str(sign),positions=(p[used]+np.array(normal)*.0005).reshape(-1).tolist(),indices=[lookup[v] for v in np.array(faces).reshape(-1)],normal=normal,axis=[0,1,0],colour='blue',kind='cap'))
data={'provenance':'Authored Solarfilm skins derived from competition CAD outer rib contours and fuselage panels; no structural CAD altered','sourceSha256':hashlib.sha256(b).hexdigest(),'panels':panels}
raw=json.dumps(data,separators=(',',':')).encode();(OUT/'solarfilm.json.gz').write_bytes(gzip.compress(raw,mtime=0));print('Solarfilm',len(panels),'panels',len(raw),'JSON bytes',len(gzip.compress(raw,mtime=0)),'gzip bytes')
