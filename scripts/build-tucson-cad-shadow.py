"""Bake the trainer's actual solar occlusion in metres, not an aircraft picture.
Each RGB channel is the sunlight projection of the original indexed CAD at a
different pitch on the approach-to-touchdown path. The live terrain shader
translates it using the actual carrier altitude; nearer wheel contact is live.
"""
import json, struct, math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
src=(ROOT/'assets/models/aircraft/skylabs-trainer/airframe.glb').read_bytes()
length=struct.unpack_from('<I',src,12)[0]; doc=json.loads(src[20:20+length])
data=memoryview(src)[28+length:]
types={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
def acc(id):
    a=doc['accessors'][id];v=doc['bufferViews'][a['bufferView']]
    n={'VEC3':3,'SCALAR':1}[a['type']];dtype=np.dtype(types[a['componentType']])
    return np.ndarray((a['count'],n),buffer=data,dtype=dtype,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',dtype.itemsize*n),dtype.itemsize))
drawlist=[]
def visit(id,base):
    n=doc['nodes'][id]
    if 'matrix' in n: mat=np.array(n['matrix']).reshape(4,4).T
    else:
        x,y,z,w=n.get('rotation',(0,0,0,1));mat=np.eye(4)
        mat[:3,:3]=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                               [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],
                               [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]])*n.get('scale',(1,1,1))
        mat[:3,3]=n.get('translation',(0,0,0))
    mat=base@mat
    if 'mesh' in n:
        for prim in doc['meshes'][n['mesh']]['primitives']:
            if prim.get('mode',4)!=4:continue
            pos=acc(prim['attributes']['POSITION'])@mat[:3,:3].T+mat[:3,3]
            indices=(acc(prim['indices']).ravel() if 'indices' in prim else np.arange(len(pos))).reshape(-1,3)
            drawlist.append((pos,indices))
    for child in n.get('children',[]):visit(child,mat)
for id in doc['scenes'][doc['scene']]['nodes']:visit(id,np.eye(4))
channels=[]; pixels=768
for pitch in [.024,.054,.084]:
    image=Image.new('L',(pixels,pixels));ctx=ImageDraw.Draw(image)
    s,c=math.sin(pitch),math.cos(pitch)
    for pts,indices in drawlist:
        xx=pts[:,0]*c-pts[:,1]*s; y=pts[:,0]*s+pts[:,1]*c
        uv=np.stack([((xx+y*.82/.39)+1.4)/3.5,((pts[:,2]+y*.46/.39)+1.4)/3.2],axis=1)
        assert np.min(uv)>0 and np.max(uv)<1, 'Projection left atlas bounds'
        xy=np.rint(uv*(pixels-1)).astype(np.int32)[indices].reshape(-1,6)
        for row in xy.tolist():ctx.polygon(row,fill=255)
    channels.append(image.filter(ImageFilter.GaussianBlur(1.05)))
out=ROOT/'assets/models/tucson-mountains/trainer-occlusion.png'
Image.merge('RGB',channels).save(out,optimize=True)
print(len(drawlist),'source meshes;',out.stat().st_size,'bytes')

