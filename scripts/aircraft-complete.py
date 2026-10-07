"""Complete the trainer's visualization with explicitly documented additions.

Run after build-v3-aircraft-assets.py. Original 117 STEP occurrences remain
unchanged. Opposite flying surfaces reuse mirrored source geometry. Skin
envelopes follow actual rib/panel silhouettes; gear is a measured-location,
proportion-based reconstruction, not an assertion about unseen hardware.
"""
from __future__ import annotations
import argparse, copy, gzip, hashlib, importlib.util, json, math, struct
from pathlib import Path
import numpy as np
from scipy.spatial import ConvexHull
import trimesh

spec=importlib.util.spec_from_file_location('aircraft_builder',Path(__file__).with_name('build-v3-aircraft-assets.py'))
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=Path('assets/models/aircraft/skylabs-trainer'));args=parser.parse_args()
    path=args.output/'airframe.glb';manifest_path=args.output/'manifest.json';manifest=json.loads(manifest_path.read_text())
    if not manifest['completion']['sourceOnly']:raise ValueError('Rebuild the original asset first; completion must never duplicate derived parts')
    gltf,raw=builder.read_glb(path);binary=bytearray(raw);parts=manifest['parts'];by_id={p['id']:p for p in parts};derived=[]
    original_integrity=builder.source_integrity(gltf,raw,parts)
    if manifest.get('sourceIntegrity') and manifest['sourceIntegrity']!=original_integrity:raise ValueError('Source geometry/transform integrity failed before completion')
    source_roots=gltf['scenes'][gltf.get('scene',0)]['nodes'];wrapper=gltf['nodes'][source_roots[0]]
    # Ground-reference origin follows the reconstructed main tires, 25mm below
    # the source bracket bottom. No original part is individually translated.
    wrapper['matrix'][13]=.193
    canonical=np.array([[-.001,0,0,.540],[0,0,.001,.193],[0,.001,0,.047],[0,0,0,1]])
    manifest['sourceToWorldMetres']=canonical.tolist();manifest['origin']='Wing spar midpoint X=540mm, fuselage centre Y=-47mm, reconstructed main-tire bottom Z=-193mm in source CAD'
    cache={}
    def rows(index):
        accessor=gltf['accessors'][index];view=gltf['bufferViews'][accessor['bufferView']]
        types={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
        return np.frombuffer(raw,dtype=types[accessor['componentType']],count=accessor['count']*widths[accessor['type']],offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)).reshape(accessor['count'],-1)
    def source_points(part):
        if part['id'] in cache:return cache[part['id']]
        result=[]
        for leaf in parts:
            if leaf['id']!=part['id'] and not leaf['id'].startswith(part['id']+'/'):continue
            node=gltf['nodes'][leaf['nodeIndex']]
            if 'mesh' not in node:continue
            matrix=np.array(leaf['worldMatrixMm'])
            for primitive in gltf['meshes'][node['mesh']]['primitives']:
                points=rows(primitive['attributes']['POSITION']).astype(float)*1000
                result.append((matrix@np.c_[points,np.ones(len(points))].T).T[:,:3])
        cache[part['id']]=np.concatenate(result);return cache[part['id']]
    def world(points):return (canonical@np.c_[points,np.ones(len(points))].T).T[:,:3]
    def find(kind):return next(p for p in parts if p['category']==kind)
    scene_nodes=gltf['scenes'][gltf.get('scene',0)]['nodes']
    original_root=next(p for p in parts if p['parentId'] is None)['nodeIndex']
    def clone(index,prefix):
        node=copy.deepcopy(gltf['nodes'][index]);node['name']=prefix+node['name'];node.setdefault('extras',{})['provenance']='Mirrored original STEP geometry, authorized symmetry completion'
        new=len(gltf['nodes']);gltf['nodes'].append(node)
        if 'children' in node:node['children']=[clone(child,prefix) for child in node['children']]
        return new
    for original,kind in [('wing-right','wing-left'),('horizontal-tail-right','horizontal-tail-left')]:
        source=find(original);child=clone(source['nodeIndex'],'derived-left-');index=len(gltf['nodes']);name='derived-'+kind
        gltf['nodes'].append({'name':name,'matrix':[1,0,0,0,0,-1,0,0,0,0,1,0,0,-.094,0,1],'children':[child],'extras':{'category':kind,'provenance':'Mirror of supplied half assembly about source Y=-47mm'}})
        gltf['nodes'][original_root]['children'].append(index)
        derived.append({'id':name,'nodeName':name,'nodeIndex':index,'category':kind,'sourceOccurrenceId':source['id'],'method':'Exact reflected mesh instances; no reshaping','sourceReflectionPlane':{'axis':'Y','millimetres':-47}})
    materials={}
    blue_srgb=[24/255,88/255,200/255]
    blue_linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in blue_srgb]
    for name,color,rough,metal in [('warm-white-film',[.82,.81,.765,1],.32,0),('user-blue-film',blue_linear+[1],.32,0),('tire',[.018,.020,.022,1],.82,0),('alloy',[.45,.48,.50,1],.28,.9)]:
        materials[name]=len(gltf['materials']);material={'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':color,'roughnessFactor':rough,'metallicFactor':metal}}
        if name.endswith('-film'):material['extensions']={'KHR_materials_clearcoat':{'clearcoatFactor':.25,'clearcoatRoughnessFactor':.25}}
        gltf['materials'].append(material)
    gltf.setdefault('extensionsUsed',[])
    if 'KHR_materials_clearcoat' not in gltf['extensionsUsed']:gltf['extensionsUsed'].append('KHR_materials_clearcoat')
    def attribute(values,target):
        values=np.asarray(values);binary.extend(b'\0'*((-len(binary))%4));view=len(gltf['bufferViews']);data=values.tobytes()
        gltf['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':target});binary.extend(data)
        accessor=len(gltf['accessors']);record={'bufferView':view,'componentType':5126 if values.dtype==np.dtype('<f4') else 5125,'count':len(values),'type':{2:'VEC2',3:'VEC3',4:'VEC4'}[values.shape[1]] if values.ndim==2 else 'SCALAR'}
        if values.ndim==2:record.update({'min':values.min(0).tolist(),'max':values.max(0).tolist()})
        gltf['accessors'].append(record);return accessor
    def add_mesh(name,mesh,material,category,provenance,extra=None,parent=None,uv=None,derive=True):
        vertices=np.asarray(mesh.vertices,dtype='<f4');normals=np.asarray(mesh.vertex_normals,dtype='<f4');faces=np.asarray(mesh.faces,dtype='<u4').reshape(-1)
        primitive={'attributes':{'POSITION':attribute(vertices,34962),'NORMAL':attribute(normals,34962)},'indices':attribute(faces,34963),'material':materials[material],'mode':4}
        if uv is not None:primitive['attributes']['TEXCOORD_0']=attribute(np.asarray(uv,dtype='<f4'),34962)
        metadata={'category':category,'provenance':provenance,**(extra or {})}
        mesh_index=len(gltf['meshes']);gltf['meshes'].append({'name':name,'primitives':[primitive],'extras':metadata});index=len(gltf['nodes'])
        gltf['nodes'].append({'name':name,'mesh':mesh_index,'extras':metadata})
        (scene_nodes if parent is None else gltf['nodes'][parent]['children']).append(index)
        record={'id':name,'nodeName':name,'nodeIndex':index,'category':category,'provenance':provenance,'bounds':mesh.bounds.tolist(),'triangles':len(mesh.faces)}
        if extra:record.update(extra)
        if derive:derived.append(record)
        return index
    def clip_x(polygon,boundary,greater):
        result=[]
        for a,b in zip(polygon,np.roll(polygon,-1,axis=0)):
            inside_a=(a[0]>=boundary) if greater else (a[0]<=boundary)
            inside_b=(b[0]>=boundary) if greater else (b[0]<=boundary)
            if inside_a:result.append(a)
            if inside_a!=inside_b:result.append(a+(b-a)*((boundary-a[0])/(b[0]-a[0])))
        if len(result)<3:raise ValueError('Control boundary removed the entire skin profile')
        return np.array(result)
    def profile(points,axis,low,high,x_min=None,x_max=None):
        selected=points[(points[:,axis]>=low-.2)&(points[:,axis]<=high+.2)];axes=[i for i in range(3) if i!=axis]
        flat=selected[:,axes];hull=flat[ConvexHull(flat).vertices]
        # The projected tessellation can contribute thousands of virtually
        # collinear points. Bound chord error on this authored skin outline to
        # 0.005mm before the 0.5mm outward offset; original CAD is untouched.
        def simplify_chain(chain):
            if len(chain)<3:return chain
            edge=chain[-1]-chain[0];delta=chain-chain[0]
            distances=np.abs(edge[0]*delta[:,1]-edge[1]*delta[:,0])/np.linalg.norm(edge)
            split=int(np.argmax(distances))
            if distances[split]<=.005:return chain[[0,-1]]
            return np.r_[simplify_chain(chain[:split+1])[:-1],simplify_chain(chain[split:])]
        opposite=int(np.argmax(np.linalg.norm(hull-hull[0],axis=1)))
        hull=np.r_[simplify_chain(hull[:opposite+1])[:-1],simplify_chain(np.r_[hull[opposite:],hull[:1]])[:-1]]
        # A taut opaque film bridges structural notches/cutouts instead of
        # reproducing those voids. The envelope is derived from actual vertices.
        edges=np.roll(hull,-1,axis=0)-hull;normals=np.c_[edges[:,1],-edges[:,0]]/np.linalg.norm(edges,axis=1,keepdims=True)
        previous=np.roll(normals,1,axis=0)
        # Intersect adjacent outward-offset edge lines. A radial offset from
        # the centroid barely moves thin airfoil surfaces along their normal.
        miter=(normals+previous)/np.maximum(1+(normals*previous).sum(axis=1,keepdims=True),1e-8)
        hull+=miter*.5
        if x_min is not None:hull=clip_x(hull,x_min,True)
        if x_max is not None:hull=clip_x(hull,x_max,False)
        # Separate u=0/u=1 vertices meet at the real trailing-edge seam.
        start=np.lexsort((hull[:,1],-hull[:,0]))[0]
        return np.roll(hull,-start,axis=0)
    film_provenance='Authored opaque film over supplied structural cross-sections, split at named source control-surface boundaries; not a source CAD solid'
    def film_group(name,category,source_id,material,region,boundary=None):
        index=len(gltf['nodes']);metadata={'category':'covering','assemblyCategory':category,'filmRegion':region,'filmMaterial':material,'provenance':film_provenance}
        gltf['nodes'].append({'name':name,'children':[],'extras':metadata});scene_nodes.append(index)
        record={'id':name,'nodeName':name,'nodeIndex':index,**metadata,'sourceOccurrenceId':source_id,'clearanceMm':.5,'envelopeProfileToleranceMm':.005,'sections':[],'triangles':0}
        if boundary:record['sourceBoundaryMm']=boundary
        derived.append(record);return record
    def skin(group,section,points,axis,stations,mirror=False,x_min=None,x_max=None):
        axes=[i for i in range(3) if i!=axis];rings=[];outlines=[];parameters=[]
        # These supplied flying surfaces are constant-section extrusions.
        # Project the whole assembly, including longitudinal members whose
        # tessellation has vertices only at the ends. A vertex slice through
        # an intermediate rib would omit those members and cut film into them.
        # Split this common outer envelope at the actual control boundaries.
        contour=profile(points,axis,points[:,axis].min(),points[:,axis].max(),x_min,x_max)
        for position,low,high in stations:
            closed=np.r_[contour,contour[:1]]
            arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(closed,axis=0),axis=1))];arc/=arc[-1]
            outlines.append((closed,arc));parameters.extend(arc[:-1])
        # Retain every corner of both source envelopes in a shared parameter
        # sequence. Uniform samples alone can cut inside a sharp leading edge.
        # The runtime interpolates neighbouring u values. Deduplicate at the
        # actual GLB Float32 precision so two nearby source corners cannot
        # become the same u and introduce a zero-width peel interval.
        samples=np.unique(np.asarray(np.r_[parameters,np.arange(256)/256,1.],dtype=np.float32)).astype(np.float64)
        for (position,low,high),(closed,arc) in zip(stations,outlines):
            contour=np.c_[np.interp(samples,arc,closed[:,0]),np.interp(samples,arc,closed[:,1])]
            ring=np.zeros((len(contour),3));ring[:,axis]=position;ring[:,axes]=contour;rings.append(ring)
        vertices=np.concatenate(rings);faces=[];n=len(rings[0]);peel_axis=np.zeros(3);peel_axis[axis]=1
        if mirror:vertices[:,1]=-94-vertices[:,1];peel_axis[1]*=-1
        peel_axis=(canonical[:3,:3]@peel_axis)/.001
        for j in range(len(rings)-1):
            for i in range(n-1):a=j*n+i;b=a+1;c=(j+1)*n+i;d=c+1;faces.extend([[a,b,c],[b,d,c]])
        faces=np.array(faces)
        if (axis==1)!=mirror:faces=faces[:,::-1]
        positions=world(vertices);uv=np.concatenate([np.c_[samples,np.full(n,j/(len(rings)-1))] for j in range(len(rings))])
        name=group['nodeName']+'-'+section
        metadata={'filmSurface':'wrap','peelAxis':peel_axis.tolist(),'ringVertexCount':n,'ringCount':len(rings),'seam':'trailing edge; u0/u1 use separate coincident vertices','ringCentres':[row.mean(0).tolist() for row in positions.reshape(len(rings),n,3)],'filmRegion':group['filmRegion'],'filmMaterial':group['filmMaterial']}
        mesh=trimesh.Trimesh(vertices=positions,faces=faces,process=False)
        add_mesh(name+'-wrap',mesh,group['filmMaterial'],'covering',film_provenance,metadata,parent=group['nodeIndex'],uv=uv,derive=False)
        section_bounds=[mesh.bounds];triangles=len(faces)
        for end in [0,len(rings)-1]:
            contour=positions[end*n:(end+1)*n-1];cap_vertices=np.r_[contour,[contour.mean(0)]];count=len(contour)
            cap_faces=np.array([[count,i,(i+1)%count] for i in range(count)])
            outward=peel_axis*(-1 if end==0 else 1)
            normal=np.cross(cap_vertices[cap_faces[0,1]]-cap_vertices[cap_faces[0,0]],cap_vertices[cap_faces[0,2]]-cap_vertices[cap_faces[0,0]])
            if np.dot(normal,outward)<0:cap_faces=cap_faces[:,::-1]
            cap=trimesh.Trimesh(vertices=cap_vertices,faces=cap_faces,process=False)
            add_mesh(name+'-cap-'+str(end),cap,group['filmMaterial'],'covering',film_provenance,{'filmSurface':'cap','end':end,'peelAxis':peel_axis.tolist(),'outwardNormal':outward.tolist(),'filmRegion':group['filmRegion'],'filmMaterial':group['filmMaterial']},parent=group['nodeIndex'],derive=False)
            section_bounds.append(cap.bounds);triangles+=len(cap_faces)
        bounds=np.concatenate(section_bounds);group['sections'].append({'name':section,'wrapNodeName':name+'-wrap','capNodeNames':[name+'-cap-0',name+'-cap-1'],'sourceSpanAxis':'XYZ'[axis],'sourceSpanMm':[stations[0][0],stations[-1][0]],'sourceXClipMm':[x_min,x_max],'ringVertexCount':n,'ringCount':len(rings),'peelAxis':peel_axis.tolist()})
        if 'bounds' in group:bounds=np.r_[bounds,group['bounds']]
        group['bounds']=[bounds.min(0).tolist(),bounds.max(0).tolist()];group['triangles']+=triangles
    wing=find('wing-right');wp=source_points(wing)
    aileron=find('aileron-right');ap=source_points(aileron);aileron_front=aileron['boundsMm'][0];aileron_start=aileron['boundsMm'][1]
    inner_edge=next(p for p in parts if p['name'].startswith('Wing_Trailing_Edge'))['boundsMm'][4]
    for mirror in [False,True]:
        suffix='left' if mirror else 'right';region=film_group('film-wing-'+suffix,'wing-'+suffix,wing['id'],'warm-white-film','fixed-wing',{'hingeX':aileron_front,'innerTrailingEndY':inner_edge,'controlStartY':aileron_start})
        skin(region,'inner',wp,1,[(-47,3,9),(inner_edge+.4,324,327)],mirror)
        skin(region,'outer',wp,1,[(inner_edge+.4,324,327),(703.4,699.5,703.5)],mirror,x_max=aileron_front)
        control=film_group('film-flaperon-'+suffix,'aileron-'+suffix,aileron['id'],'user-blue-film','flaperon',{'hingeX':aileron_front,'spanStartY':aileron_start,'spanEndY':aileron['boundsMm'][4]})
        skin(control,'control',ap,1,[(aileron_start-.4,333,336),(703.4,700,703)],mirror,x_min=aileron_front)
    tail=find('horizontal-tail-right');tp=source_points(tail);elevator=find('elevator-right');ep=source_points(elevator);elevator_front=elevator['boundsMm'][0]
    for mirror in [False,True]:
        suffix='left' if mirror else 'right';fixed=film_group('film-horizontal-tail-'+suffix,'horizontal-tail-'+suffix,tail['id'],'user-blue-film','fixed-horizontal-stabilizer',{'hingeX':elevator_front})
        skin(fixed,'fixed',tp,1,[(-47,-37,-31),(253.4,249.5,253.5)],mirror,x_max=elevator_front)
        control=film_group('film-elevator-'+suffix,'elevator-'+suffix,elevator['id'],'warm-white-film','elevator',{'hingeX':elevator_front})
        skin(control,'control',ep,1,[(-47,-37,-34),(253.4,250,253)],mirror,x_min=elevator_front)
    vt=find('vertical-tail');vp=source_points(vt);rudder=find('rudder');rp=source_points(rudder);rudder_front=rudder['boundsMm'][0]
    fixed=film_group('film-vertical-tail','vertical-tail',vt['id'],'user-blue-film','fixed-vertical-stabilizer',{'hingeX':rudder_front})
    skin(fixed,'fixed',vp,2,[(59.6,60,66),(380.4,376.5,380.5)],x_max=rudder_front)
    control=film_group('film-rudder','rudder',rudder['id'],'warm-white-film','rudder',{'hingeX':rudder_front})
    skin(control,'control',rp,2,[(59.6,60,63),(380.4,377,380)],x_min=rudder_front)
    side=next(p for p in parts if p['name'].startswith('Fuselage_Main_Side_Panel v'));sp=source_points(side)
    nose_panels=[p for p in parts if p['name'].startswith(('Fuselage_Nose_Connector','Ply_Fuselage_Rib_1'))]
    hatch=next(p for p in parts if p['name'].startswith('Fuselage_Top_Hatch_Balsa'))
    # The removable balsa hatch rises above the wing's rib profile. Include its
    # actual surface in the body envelope so this wood receives film as well.
    body_sources=nose_panels+[hatch]
    sp=np.concatenate([sp]+[source_points(p) for p in body_sources])
    fuselage_film=film_group('film-fuselage','fuselage',side['id'],'warm-white-film','fuselage')
    skin(fuselage_film,'body',sp,1,[(-97.5,-.1,3.1),(3.5,-.1,3.1)])
    fuselage_film['sourceOccurrenceIds']=[side['id']]+[p['id'] for p in body_sources]
    # Original main gear is only a bracket. Wheels deliberately carry explicit
    # reconstruction metadata, dimensions and attachment coordinates.
    pitch=math.radians(2);main_x=-.007;main_y=.035;main_z=.171;main_radius=.035
    landing_y=main_radius-(math.sin(pitch)*main_x+math.cos(pitch)*main_y)
    nose_x=.504;nose_radius=.028;nose_y=(nose_radius-landing_y-math.sin(pitch)*nose_x)/math.cos(pitch)
    def cylinder_between(a,b,radius,sections=40):return trimesh.creation.cylinder(radius=radius,segment=np.array([a,b]),sections=sections)
    def wheel(name,centre,radius,width,kind):
        centre=np.array(centre);bevel=.002;half=width/2
        cross=[[0,-half],[radius-bevel,-half]]
        cross.extend([[radius-bevel+bevel*math.cos(a),-half+bevel+bevel*math.sin(a)] for a in np.linspace(-math.pi/2,0,8)])
        cross.extend([[radius-bevel+bevel*math.cos(a),half-bevel+bevel*math.sin(a)] for a in np.linspace(0,math.pi/2,8)])
        cross.extend([[0,half],[0,-half]])
        tire=trimesh.creation.revolve(np.array(cross),sections=80)
        # Include the exact pitched contact direction in the tessellated rim,
        # so the mesh itself reaches the analytic ground contact, not just its
        # implicit cylinder (which could otherwise float by a small chord error).
        tire.apply_transform(trimesh.transformations.rotation_matrix(-pitch,[0,0,1]));tire.apply_translation(centre)
        add_mesh(name,tire,'tire',kind,'Reconstructed unfaired wheel; diameter/width inferred for visual proportion, not supplied CAD',{'centre':centre.tolist(),'axis':[0,0,1],'radius':radius,'width':width})
        hub=trimesh.creation.cylinder(radius=radius*.30,height=width+.001,sections=40);hub.apply_translation(centre)
        add_mesh(name+'-hub',hub,'alloy',kind,'Reconstructed wheel hub',{'wheel':name})
    for side,sign in [('left',-1),('right',1)]:
        centre=[main_x,main_y,main_z*sign];wheel('derived-main-wheel-'+side,centre,main_radius,.018,'main-wheel')
        axle=cylinder_between([main_x,main_y,.156*sign],[main_x,main_y,.184*sign],.002)
        add_mesh('derived-main-axle-'+side,axle,'alloy','main-wheel','Reconstructed axle passing through source bracket foot region')
    wheel('derived-nose-wheel',[nose_x,nose_y,0],nose_radius,.014,'nose-wheel')
    # A bent wire descends from the real transverse bore and offsets to one
    # side of the tire. This is plausible linkage, explicitly not hidden CAD.
    wire_points=[[.5075,.207,0],[.504,.197,0],[.504,.073,-.012],[nose_x,nose_y,-.012],[nose_x,nose_y,.009]]
    wire=trimesh.util.concatenate([cylinder_between(a,b,.002) for a,b in zip(wire_points,wire_points[1:])])
    add_mesh('derived-nose-strut',wire,'alloy','nose-gear','Reconstructed 4mm bent-wire strut located at source Nose_Gear_Mount transverse bore; linkage not available in source',{'mountSourceMm':[28.500187,-47,14]})
    def contact(cx,cy,cz,radius):
        # In the aircraft frame, the bottom contact follows the inverse pitched
        # gravity direction. Transforming it yields exact settled world Y=0.
        point=[cx-radius*math.sin(pitch),cy-radius*math.cos(pitch),cz]
        world_point=[math.cos(pitch)*point[0]-math.sin(pitch)*point[1],math.sin(pitch)*point[0]+math.cos(pitch)*point[1]+landing_y,cz]
        return {'aircraftLocal':point,'settledWorld':world_point}
    prop=find('propeller');prop_points=world(source_points(prop));prop_rot_y=prop_points[:,0]*math.sin(pitch)+prop_points[:,1]*math.cos(pitch)+landing_y
    prop_center=[.739,.243,0]
    manifest['derivedParts']=derived
    manifest['filmLivery']={'authority':'User-directed colour placement; chosen blue shade is not photo-measured','blueSrgbHex':'#1858c8','blueMaterial':'user-blue-film','blueRegions':['flaperon','fixed-horizontal-stabilizer','fixed-vertical-stabilizer'],'whiteRegions':['fixed-wing','elevator','rudder','fuselage'],'sourceBoundariesMm':{'flaperon':{'hingeX':aileron_front,'spanStartY':aileron_start,'spanEndY':aileron['boundsMm'][4],'inboardFixedTrailingEndY':inner_edge},'elevator':{'hingeX':elevator_front},'rudder':{'hingeX':rudder_front}},'topology':'Independent wrapper sheets with coincident but distinct trailing-edge seam vertices, perimeter/span UV coordinates, and separate end-cap tabs; derived geometry only'}
    if builder.source_integrity(gltf,bytes(binary),parts)!=original_integrity:raise ValueError('Completion modified original source geometry or local transforms')
    manifest['sourceIntegrity']=original_integrity
    manifest['completion']={'sourceOnly':False,'reconstruction':['Opposite wing and horizontal-tail source structures mirrored about source Y=-47mm','Opaque film envelopes split at named source control boundaries: user-directed blue flaperons and fixed stabilizers, white remaining surfaces','Two 70mm main wheels, 56mm nose wheel, axles and 4mm nose wire reconstructed at source mounting regions'],'missing':[],'limitations':['Wheel dimensions and nose linkage are visually plausible reconstructions, not measured hardware','Film lofts bridge structural cutouts; source CAD contains no covering solids','Blue placement is user-directed; exact #1858c8 shade was chosen for the visualization, not measured from photographs','No unverified crest or livery artwork added','Exposed source carbon tailboom retained'],'dimensionDiscrepancies':[{'feature':'horizontal-tail span','cadMetres':.6,'workbookNominalMetres':.7,'resolution':'Preserve actual CAD geometry'}]}
    manifest['contacts']={'mainLeft':contact(main_x,main_y,-main_z,main_radius),'mainRight':contact(main_x,main_y,main_z,main_radius),'nose':contact(nose_x,nose_y,0,nose_radius),'groundPlaneY':0,'landingPose':{'rotationZ':pitch,'translationY':landing_y},'propeller':{'nodeName':prop['nodeName'],'axis':[1,0,0],'centre':prop_center,'radius':.22215,'settledMinimumClearance':float(prop_rot_y.min()),'geometryUnchanged':True},'sourceBracketBottomMm':-168,'mainTireBottomSourceMm':-193}
    manifest['telemetryMount']={'position':[-.010,.225,0],'rotation':[0,0,0],'physicalBoardSize':[.07303,.0016,.05705],'sourcePositionMm':[550,-47,32],'provenance':'User authorized centre fuselage below wing, orientation unrestricted; physical board dimensions from original telemetry assembly metadata','boardScaleFromNormalizedWidth':.07303}
    # Compute final bounds from the original source box, reflected flying
    # surfaces and every added mesh; approximation never changes source CAD.
    bounds=[world(np.array([p['boundsMm'][:3],p['boundsMm'][3:]])) for p in parts]
    bounds.extend([np.array(d['bounds']) for d in derived if 'bounds' in d]);points=np.concatenate(bounds);points=np.r_[points,[[points[:,0].min(),points[:,1].min(),-.75],[points[:,0].max(),points[:,1].max(),.75]]]
    manifest['bounds']=[points.min(0).tolist(),points.max(0).tolist()]
    builder.write_glb(path,gltf,bytes(binary));payload=path.read_bytes();compressed=gzip.compress(payload,compresslevel=9,mtime=0);(args.output/'airframe.glb.gz').write_bytes(compressed)
    manifest['asset'].update({'bytes':len(payload),'gzipBytes':len(compressed),'sha256':hashlib.sha256(payload).hexdigest(),'meshes':len(gltf['meshes']),'nodes':len(gltf['nodes'])})
    manifest['rebuild']=['python scripts/build-v3-aircraft-assets.py --source <Full_Assembly.step>','python scripts/aircraft-complete.py']
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'asset':manifest['asset'],'sourceParts':len(parts),'derivedParts':len(derived),'bounds':manifest['bounds'],'contacts':manifest['contacts']},indent=2))
if __name__=='__main__':main()
