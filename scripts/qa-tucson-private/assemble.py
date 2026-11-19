"""Pair identical camera frames without relabelling fallbacks as GPU frames."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import json,sys
root=Path(sys.argv[1])
before=json.loads((root/'before/results.json').read_text()); after=json.loads((root/'after/results.json').read_text())
def get(obj): return next(r for r in obj['all'] if r['mode']=='normal')
b,a=get(before),get(after)
def shot(tag,item):
 im=Image.open(root/tag/item['file']).convert('RGB');im.thumbnail((640,500),Image.Resampling.LANCZOS);return im
pairs=[]
for ix in [0,1,3,4,5]:
 if len(a['frames'])<=ix or len(b['frames'])<=ix: continue
 ar,br=a['frames'][ix],b['frames'][ix]
 if not all(z['stat']['renderer'] and z['stat']['activeGL'] for z in [ar,br]):continue
 left,right=shot('before',br),shot('after',ar)
 w=left.width+right.width; h=max(left.height,right.height)+25
 row=Image.new('RGB',(w,h),'#171917');d=ImageDraw.Draw(row);d.text((5,4),f"BEFORE | live trainer + still backdrop   {br['type']} {br['v']}",fill='white');d.text((left.width+5,4),f"AFTER | live trainer + rendered terrain   {ar['type']} {ar['v']}",fill='white')
 row.paste(left,(0,25));row.paste(right,(left.width,25));pairs.append(row)
if pairs:
 im=Image.new('RGB',(max(x.width for x in pairs),sum(x.height for x in pairs)),'#171917')
 y=0
 for x in pairs:im.paste(x,(0,y));y+=x.height
 im.save(root/'comparison.jpg',quality=90)
def footprint(z):
 rs=z['network'].get('requests',[]);return {'totalWire':sum(x.get('encoded',0) for x in rs),'sceneFiles':z['network'].get('scene',[]),'readyStats':[{k:f['stat'][k] for k in ['calls','triangles','geometry','textures','mask','activeGL']} for f in z['frames']], 'errors':z.get('pageErrors',[])}
(root/'footprint.json').write_text(json.dumps({'before':footprint(b),'after':footprint(a)},indent=2))

# Camera translation residual, removing apparent screen travel due only to rotation.
# Compare two achieved arrival camera poses: these are original 3D scene points.
import math,statistics
frames=a.get('frames',[])
def mv(m,v):return [sum(m[i+j*4]*v[j] for j in range(4)) for i in range(4)]
def expected_rotation_only(w,center0,pose1):
 m=pose1['camera'];dif=[w[i]-center0[i] for i in range(3)]
 # R^T for a rigid camera: each column of the camera world matrix is a camera axis.
 q=[sum(m[4*j+i]*dif[i] for i in range(3)) for j in range(3)]+[1]
 v=mv(pose1['projection'],q);return [v[0]/v[3],v[1]/v[3]] if abs(v[3])>1e-6 else None
if len(frames)>=4:
 x0,x1=frames[0]['stat'],frames[3]['stat'];c0=x0['camera'][12:15];c1=x1['camera'][12:15];groups={}
 for obj0,obj1 in zip(x0['geo'],x1['geo']):
  if obj0['name']!=obj1['name'] or not obj0['visible'] or not obj1['visible']:continue
  for p0,p1 in zip(obj0['points'],obj1['points']):
   if p0['inst']!=p1['inst'] or math.dist(p0['w'],p1['w'])>1e-6:continue
   if any(abs(v)>1 for v in p0['screen']+p1['screen']):continue
   rot=expected_rotation_only(p0['w'],c0,x1)
   if not rot:continue
   dx=(p1['screen'][0]-rot[0])*x1['canvas'][0]/2;dy=(p1['screen'][1]-rot[1])*x1['canvas'][1]/2
   groups.setdefault(obj0['name'],[]).append([math.dist(p0['w'],c0),math.hypot(dx,dy)])
 groups={k:{'matches':len(v),'medianDepthLocal':round(statistics.median(x[0] for x in v),3),'medianTranslationPx':round(statistics.median(x[1] for x in v),3)} for k,v in groups.items()}
 (root/'depth-motion.json').write_text(json.dumps({'pose0':frames[0]['type']+str(frames[0]['v']),'pose1':frames[3]['type']+str(frames[3]['v']),'cameraTranslation':math.dist(c0,c1),'groups':dict(sorted(groups.items(),key=lambda kv:kv[1]['medianDepthLocal']))},indent=2))

