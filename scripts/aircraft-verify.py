"""Verify the delivered aircraft geometry, provenance and landing contacts offline."""
from pathlib import Path
import argparse, gzip, hashlib, importlib.util, json, math
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.spatial import ConvexHull
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
def array(index):
    accessor=gltf['accessors'][index];view=gltf['bufferViews'][accessor['bufferView']]
    size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[accessor['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[accessor['componentType']]
    return np.frombuffer(raw,dtype=dtype,count=accessor['count']*size,offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape(-1,size)
def positions(node_index):
    node=gltf['nodes'][node_index];points=[]
    for primitive in gltf['meshes'][node['mesh']]['primitives']:
        vertices=array(primitive['attributes']['POSITION'])
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
coverings=[part for part in manifest['derivedParts'] if part['category']=='covering'];assert len(coverings)==11
source_controls={part['category']:part for part in manifest['parts'] if part['category'] in ['aileron-right','elevator-right','rudder']}
expected_counts={'fixed-wing':2,'flaperon':2,'fixed-horizontal-stabilizer':2,'elevator':2,'fixed-vertical-stabilizer':1,'rudder':1,'fuselage':1}
assert {region:sum(part['filmRegion']==region for part in coverings) for region in expected_counts}==expected_counts
blue_regions={'flaperon','fixed-horizontal-stabilizer','fixed-vertical-stabilizer'};inverse=np.linalg.inv(canonical);wrap_count=0;cap_count=0
enclosure_checks=0
for part in coverings:
    region=part['filmRegion'];expected='user-blue-film' if region in blue_regions else 'warm-white-film';assert part['filmMaterial']==expected
    if region=='fuselage':
        hatch=next(original for original in manifest['parts'] if original['name'].startswith('Fuselage_Top_Hatch_Balsa'))
        assert hatch['id'] in part['sourceOccurrenceIds'],'The genuine balsa hatch must be enclosed by the body film'
    for child_index in gltf['nodes'][part['nodeIndex']]['children']:
        child=gltf['nodes'][child_index];extra=child['extras'];primitive=gltf['meshes'][child['mesh']]['primitives'][0]
        material=gltf['materials'][primitive['material']];assert material['name']==expected,'Only requested fixed/control regions receive blue'
        if expected=='user-blue-film':
            channels=[24/255,88/255,200/255];linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in channels]
            assert np.allclose(material['pbrMetallicRoughness']['baseColorFactor'],linear+[1]),'User blue must be exported with correct glTF linear colour'
        vertices=positions(child_index);source=(inverse@np.c_[vertices,np.ones(len(vertices))].T).T[:,:3];xs=source[:,0]
        span_y=np.abs(vertices[:,2])*1000-47
        if region=='flaperon':
            original=source_controls['aileron-right'];assert xs.min()>=original['boundsMm'][0]-.005
            assert span_y.min()>=original['boundsMm'][1]-.405,'Blue must not extend onto the inner trailing wing'
            assert span_y.max()<=original['boundsMm'][4]+.405
        if region=='fixed-wing':
            assert np.all((xs<=source_controls['aileron-right']['boundsMm'][0]+.005)|(span_y<=327.405)),'The fixed wing must not cover the flaperon region/root clearance'
        if region in ['fixed-horizontal-stabilizer','elevator']:
            hinge=source_controls['elevator-right']['boundsMm'][0]
            assert xs.max()<=hinge+.005 if region.startswith('fixed') else xs.min()>=hinge-.005
        if region in ['fixed-vertical-stabilizer','rudder']:
            hinge=source_controls['rudder']['boundsMm'][0]
            assert xs.max()<=hinge+.005 if region.startswith('fixed') else xs.min()>=hinge-.005
        if extra['filmSurface']=='wrap':
            wrap_count+=1;uv=array(primitive['attributes']['TEXCOORD_0']);n=extra['ringVertexCount'];rings=extra['ringCount'];assert len(vertices)==n*rings
            # Film must enclose continuous source members, even where those
            # members have no tessellation vertices at an intermediate rib.
            # All ring sections use the source assembly's constant profile.
            section=next(item for item in part['sections'] if item['wrapNodeName']==child['name'])
            source_ids=part.get('sourceOccurrenceIds',[part['sourceOccurrenceId']]);structure=[]
            for original in manifest['parts']:
                if not any(original['id']==ident or original['id'].startswith(ident+'/') for ident in source_ids):continue
                if 'mesh' not in gltf['nodes'][original['nodeIndex']]:continue
                points=positions(original['nodeIndex']);structure.append((inverse@np.c_[points,np.ones(len(points))].T).T[:,:3])
            structure=np.concatenate(structure);xmin,xmax=section['sourceXClipMm']
            if xmin is not None:structure=structure[structure[:,0]>=xmin-.002]
            if xmax is not None:structure=structure[structure[:,0]<=xmax+.002]
            axis='XYZ'.index(section['sourceSpanAxis']);cross_axes=[i for i in range(3) if i!=axis]
            # Undo the authorised opposite-half reflection for comparison
            # against its original source occurrence.
            contour_source=source.copy()
            if part['assemblyCategory'].endswith('-left'):contour_source[:,1]=-94-contour_source[:,1]
            for ring in range(rings):
                values=uv[ring*n:(ring+1)*n];assert values[0,0]==0 and values[-1,0]==1
                assert np.all(np.diff(values[:,0])>0) and np.all(values[:,1]==ring/(rings-1)),'Each Float32 wrapper ring must have strictly increasing perimeter coordinates'
                assert np.allclose(vertices[ring*n],vertices[(ring+1)*n-1],atol=1e-8),'The rest-state seam must remain closed'
                hull=ConvexHull(contour_source[ring*n:(ring+1)*n-1][:,cross_axes]);worst=-float('inf')
                for batch in np.array_split(structure[:,cross_axes],max(1,math.ceil(len(structure)/2048))):
                    distances=batch@hull.equations[:,:2].T+hull.equations[:,2];worst=max(worst,float(distances.max()))
                assert worst<.01,f'{child["name"]} ring {ring} cuts into source structure by {worst:.6f} mm'
                enclosure_checks+=1
            indices=array(primitive['indices']).reshape(-1,3)%n
            assert not np.any(np.any(indices==0,axis=1)&np.any(indices==n-1,axis=1)),'No face may stitch across the peel seam'
        elif extra['filmSurface']=='cap':
            cap_count+=1;axis=np.array(extra['peelAxis']);assert np.isclose(np.linalg.norm(axis),1)
            assert np.allclose(extra['outwardNormal'],axis*(-1 if extra['end']==0 else 1))
        else:raise AssertionError('Every film child must identify a wrapper or end tab')
assert wrap_count==13 and cap_count==26
assert manifest['filmLivery']['blueSrgbHex']=='#1858c8'
print(json.dumps({'result':'PASS','originalOccurrences':117,'derivedGroups':len(manifest['derivedParts']),'sourceGeometryAndTransformsPreserved':True,'sourceProfileEnclosureChecks':enclosure_checks,'userColourRegions':expected_counts,'openSeamWrappers':wrap_count,'separateCapTabs':cap_count,'groundContacts':contacts,'propellerClearanceMetres':float(clearance),'bytes':len(payload)},indent=2))
