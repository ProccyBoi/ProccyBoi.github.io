"""Extract simply connected front lands from the lossless telemetry CAD pack.
Not a stencil export. Original CAD/pack is read-only; annular holes are excluded.
"""
import hashlib,json,struct
from collections import Counter,defaultdict
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'assets/models/hero/telemetry.bin'
b=source.read_bytes();size,start=struct.unpack_from('<II',b,8);g=json.loads(b[16:16+size])
mesh=next(n for n in g['nodes'] if n.get('type')=='Mesh' and g['materials'][n['material']]['properties']['name']=='mat_46')
geo=g['geometries'][mesh['geometry']]
def array(a,kind):
 return struct.unpack_from('<'+kind*(a['byteLength']//4),b,start+a['byteOffset'])
p=array(geo['attributes']['position'],'f');n=array(geo['attributes']['normal'],'f');ids=array(geo['index'],'I')
points=[];lookup={};triangles=[]
for i in range(0,len(ids),3):
 tri=ids[i:i+3]
 if not all(n[v*3+1]>.99 and p[v*3+1]>.02 for v in tri):continue
 corners=[]
 for v in tri:
  key=(round(p[v*3],7),round(p[v*3+2],7))
  if key not in lookup:lookup[key]=len(points);points.append(key)
  corners.append(lookup[key])
 triangles.append(corners)
parent=list(range(len(points)))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for a,c,d in triangles:
 parent[find(c)]=find(a);parent[find(d)]=find(a)
groups=defaultdict(list)
for tri in triangles:groups[find(tri[0])].append(tri)
lands=[]
for tris in groups.values():
 edges=Counter(tuple(sorted((t[i],t[(i+1)%3]))) for t in tris for i in range(3))
 boundary=[e for e,count in edges.items() if count==1]
 adjacency=defaultdict(list)
 for a,c in boundary:adjacency[a].append(c);adjacency[c].append(a)
 if not adjacency or any(len(v)!=2 for v in adjacency.values()):continue
 seen=set();todo=[next(iter(adjacency))]
 while todo:
  v=todo.pop()
  if v in seen:continue
  seen.add(v);todo.extend(adjacency[v])
 if len(seen)!=len(adjacency):continue # Multiple loops: drilled annulus, not a paste land.
 vertices=sorted(set(v for t in tris for v in t));remap={v:i for i,v in enumerate(vertices)}
 area=sum(abs((points[c][0]-points[a][0])*(points[d][1]-points[a][1])-(points[d][0]-points[a][0])*(points[c][1]-points[a][1]))/2 for a,c,d in tris)*73.03**2
 if area<.075:continue
 lands.append({'p':[points[v] for v in vertices],'t':[[remap[v] for v in t] for t in tris],'e':[[remap[v] for v in e] for e in boundary]})
result={'source':'/assets/models/hero/telemetry.bin','sha256':hashlib.sha256(b).hexdigest(),'note':'Simply connected top CAD lands; drilled annuli excluded. Illustrative deposits, not production paste apertures.','lands':lands}
out=ROOT/'assets/models/manufacturing/skylabs-reflow-lands.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'{len(lands)} CAD lands; {out.stat().st_size} bytes')
