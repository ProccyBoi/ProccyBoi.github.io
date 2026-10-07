"""Verify the delivered aircraft geometry, provenance and landing contacts offline."""
from pathlib import Path
import argparse, gzip, hashlib, importlib.util, json, math
import numpy as np
from scipy.spatial.transform import Rotation
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-v3-aircraft-assets.py'))
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=Path('assets/models/aircraft/skylabs-trainer'));folder=parser.parse_args().output
payload=(folder/'airframe.glb').read_bytes();manifest=json.loads((folder/'manifest.json').read_text());gltf,raw=builder.read_glb(folder/'airframe.glb')
assert gzip.decompress((folder/'airframe.glb.gz').read_bytes())==payload
assert hashlib.sha256(payload).hexdigest()==manifest['asset']['sha256']
assert len(manifest['parts'])==117
assert builder.source_integrity(gltf,raw,manifest['parts'])==manifest['sourceIntegrity']
names=[node.get('name') for node in gltf['nodes']];assert len(set(names))==len(names),'Unique names are required for part selection'
def local(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
    matrix=np.eye(4);matrix[:3,:3]=Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix()@np.diag(node.get('scale',[1,1,1]));matrix[:3,3]=node.get('translation',[0,0,0]);return matrix
worlds={}
def traverse(index,parent):
    assert index not in worlds,'A glTF node must have a single parent'
    node=gltf['nodes'][index];worlds[index]=parent@local(node)
    for child in node.get('children',[]):traverse(child,worlds[index])
for index in gltf['scenes'][gltf.get('scene',0)]['nodes']:traverse(index,np.eye(4))
canonical=np.array(manifest['sourceToWorldMetres'])
assert np.allclose(np.linalg.norm(canonical[:3,:3],axis=0),.001),'Source mm converts exactly once to metres'
for part in manifest['parts']:
    assert gltf['nodes'][part['nodeIndex']]['name']==part['nodeName']
    expected=canonical@np.array(part['worldMatrixMm'])@np.diag([1000,1000,1000,1])
    assert np.allclose(worlds[part['nodeIndex']],expected,atol=2e-9),'Original assembled transform must survive: '+part['name']
def positions(node_index):
    node=gltf['nodes'][node_index];points=[]
    for primitive in gltf['meshes'][node['mesh']]['primitives']:
        accessor=gltf['accessors'][primitive['attributes']['POSITION']];view=gltf['bufferViews'][accessor['bufferView']]
        vertices=np.frombuffer(raw,dtype='<f4',count=accessor['count']*3,offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape(-1,3)
        assert np.isfinite(vertices).all()
        points.append((worlds[node_index]@np.c_[vertices,np.ones(len(vertices))].T).T[:,:3])
    return np.concatenate(points)
pitch=manifest['contacts']['landingPose']['rotationZ'];height=manifest['contacts']['landingPose']['translationY'];contacts=[]
for part in manifest['derivedParts']:
    assert gltf['nodes'][part['nodeIndex']]['name']==part['nodeName']
    assert part.get('provenance') or part.get('method')
    if part['category'] not in ['main-wheel','nose-wheel'] or 'radius' not in part:continue
    vertices=positions(part['nodeIndex']);y=vertices[:,0]*math.sin(pitch)+vertices[:,1]*math.cos(pitch)+height
    assert abs(y.min())<1e-7,'Tessellated tire must touch actual ground: '+part['nodeName']
    contacts.append({'wheel':part['nodeName'],'lowestSettledVertexY':float(y.min())})
assert len(contacts)==3
prop=next(part for part in manifest['parts'] if part['category']=='propeller');vertices=positions(prop['nodeIndex']);clearance=(vertices[:,0]*math.sin(pitch)+vertices[:,1]*math.cos(pitch)+height).min()
assert clearance>.04,'Original propeller must clear the ground at landing attitude'
assert abs(clearance-manifest['contacts']['propeller']['settledMinimumClearance'])<1e-8
assert manifest['completion']['dimensionDiscrepancies'][0]['cadMetres']==.6
assert len([part for part in manifest['derivedParts'] if part['category']=='covering'])==6
print(json.dumps({'result':'PASS','originalOccurrences':117,'derivedGroups':len(manifest['derivedParts']),'sourceGeometryAndTransformsPreserved':True,'groundContacts':contacts,'propellerClearanceMetres':float(clearance),'bytes':len(payload)},indent=2))
