"""Tessellate the original trainer STEP as a named, metre-scale glTF assembly.

No source CAD is modified. Curved faces are tessellated at 0.15 mm absolute
deflection; no mesh simplification or fabricated replacement parts are used.
The final rigid wrapper changes the coordinate convention, not relative parts.
"""
from __future__ import annotations
import argparse, gzip, hashlib, importlib.util, json, struct
from pathlib import Path
import numpy as np
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem, RWMesh_NameFormat
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.XCAFDoc import XCAFDoc_ShapeTool

spec=importlib.util.spec_from_file_location('aircraft_inspect',Path(__file__).with_name('aircraft-inspect.py'))
inspection=importlib.util.module_from_spec(spec);spec.loader.exec_module(inspection)
spec=importlib.util.spec_from_file_location('hardware_assets',Path(__file__).with_name('build-hardware-catalog.py'))
hardware=importlib.util.module_from_spec(spec);spec.loader.exec_module(hardware)

def read_glb(path):
    content=path.read_bytes();length=struct.unpack_from('<I',content,12)[0]
    return json.loads(content[20:20+length]),content[28+length:]

def write_glb(path,data,binary):
    data['buffers'][0]['byteLength']=len(binary)
    text=json.dumps(data,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
    binary+=b'\0'*((-len(binary))%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(text)+len(binary))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(binary),b'BIN\0')+binary)

def compact(path):
    report=hardware.compact_source_geometry(path)
    data,source=read_glb(path);binary=bytearray();views=[];accessors=[];lookup={};mapping={}
    for old,item in enumerate(data['accessors']):
        view=data['bufferViews'][item['bufferView']]
        if view.get('byteStride') or item.get('byteOffset'):raise ValueError('Batcher must produce tightly packed buffers')
        raw=source[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
        key=(item['componentType'],item['count'],item['type'],raw)
        if key not in lookup:
            binary.extend(b'\0'*((-len(binary))%4));vi=len(views);views.append({**view,'byteOffset':len(binary)});binary.extend(raw)
            lookup[key]=len(accessors);accessors.append({**item,'bufferView':vi})
        mapping[old]=lookup[key]
    data['accessors']=accessors;data['bufferViews']=views;meshes=[];mesh_lookup={};mesh_mapping={}
    for old,mesh in enumerate(data['meshes']):
        for primitive in mesh['primitives']:
            primitive['indices']=mapping[primitive['indices']]
            primitive['attributes']={key:mapping[value] for key,value in primitive['attributes'].items()}
        key=json.dumps(mesh['primitives'],sort_keys=True)
        if key not in mesh_lookup:mesh_lookup[key]=len(meshes);meshes.append(mesh)
        mesh_mapping[old]=mesh_lookup[key]
    for node in data['nodes']:
        if 'mesh' in node:node['mesh']=mesh_mapping[node['mesh']]
    data['meshes']=meshes;write_glb(path,data,bytes(binary))
    report.update({'afterInterningBytes':path.stat().st_size,'meshDefinitions':len(meshes),'sharedAccessorCount':len(accessors),'instancing':'Byte-identical geometry and material primitives shared; original occurrence transforms retained'})
    return report

def source_integrity(gltf,binary,parts):
    geometry=hashlib.sha256();transforms=hashlib.sha256()
    for part in parts:
        node=gltf['nodes'][part['nodeIndex']]
        transforms.update(json.dumps({key:node[key] for key in ['name','matrix','translation','rotation','scale'] if key in node},sort_keys=True).encode())
        if 'mesh' not in node:continue
        for primitive in gltf['meshes'][node['mesh']]['primitives']:
            for name,index in sorted(primitive['attributes'].items())+[('indices',primitive['indices'])]:
                accessor=gltf['accessors'][index];view=gltf['bufferViews'][accessor['bufferView']]
                geometry.update(name.encode());geometry.update(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
    return {'geometrySha256':geometry.hexdigest(),'localTransformsSha256':transforms.hexdigest()}

def category(name):
    if name.startswith('Wing_Assembly'):return 'wing-right'
    if name.startswith('HT_Assembly'):return 'horizontal-tail-right'
    if name.startswith('VT_Assembly'):return 'vertical-tail'
    if name.startswith('Fuselage_Assembly'):return 'fuselage'
    if 'Prop' in name:return 'propeller'
    if 'smotor' in name:return 'motor'
    if name.startswith('landing_gear'):return 'main-gear'
    if name.startswith('Nose_Gear'):return 'nose-gear-mount'
    if name.startswith('CF_Tube'):return 'carbon-tube'
    if 'Aileron_Assembly' in name:return 'aileron-right'
    if 'Elevator_Assembly' in name:return 'elevator-right'
    if 'Rudder_Assembly' in name:return 'rudder'
    return 'structure'

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('assets/models/aircraft/skylabs-trainer'));args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    document,reader,tool,roots=inspection.load(args.source);report=inspection.inspect(args.source,document,roots)
    records={r['id']:r for r in report['instances']};product_ids={p['name']:p for p in report['sourceProducts']}
    renamed=set()
    def rename(label):
        definition=TDF_Label()
        if not XCAFDoc_ShapeTool.GetReferredShape_s(label,definition):definition=label
        for item in [label,definition]:
            key=inspection.label_id(item)
            if key not in renamed:TDataStd_Name.Set_s(item,TCollection_ExtendedString('cad_'+key.replace(':','_')));renamed.add(key)
        children=TDF_LabelSequence();XCAFDoc_ShapeTool.GetComponents_s(definition,children,False)
        for i in range(1,children.Length()+1):rename(children.Value(i))
    for i in range(1,roots.Length()+1):
        shape=XCAFDoc_ShapeTool.GetShape_s(roots.Value(i));mesher=BRepMesh_IncrementalMesh(shape,.15,False,.12,True);mesher.Perform()
        if not mesher.IsDone():raise RuntimeError('Aircraft tessellation failed')
        rename(roots.Value(i))
    target=args.output/'airframe.glb'
    writer=RWGltf_CafWriter(TCollection_AsciiString(str(target)),True)
    writer.SetMergeFaces(True);writer.SetNodeNameFormat(RWMesh_NameFormat.RWMesh_NameFormat_InstanceOrProduct)
    converter=writer.ChangeCoordinateSystemConverter();converter.SetInputLengthUnit(.001);converter.SetOutputLengthUnit(1)
    # Keep source XYZ through tessellation; the explicit root below supplies
    # the one documented right-handed rotation and translation to web space.
    converter.SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup)
    converter.SetOutputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup)
    if not writer.Perform(document,TColStd_IndexedDataMapOfStringString(),Message_ProgressRange()):raise RuntimeError('glTF export failed')
    compact_report=compact(target)
    gltf,binary=read_glb(target);parts=[]
    def annotate(index,parent_path):
        node=gltf['nodes'][index];label=node.get('name','').removeprefix('cad_').replace('_',':');path=parent_path+[label];key='/'.join(path)
        if key not in records:raise ValueError('Exported hierarchy differs from original STEP: '+key)
        item=records[key];kind=category(item['name']);name='cad-'+str(index)+'-'+item['name'].replace(' ','-')
        node['name']=name;node['extras']={'sourceOccurrenceId':key,'sourceProductLabel':item['productLabel'],'sourceProduct':product_ids.get(item['name']),'category':kind,'provenance':'original STEP tessellation'}
        parts.append({**item,'nodeIndex':index,'nodeName':name,'category':kind,'sourceProduct':product_ids.get(item['name'])})
        for child in node.get('children',[]):annotate(child,path)
    scene=gltf['scenes'][gltf.get('scene',0)]
    for index in scene['nodes']:annotate(index,[])
    if len(parts)!=len(records):raise ValueError('Every STEP occurrence must remain represented')
    # Column-major matrix: X = .540-sourceX, Y = sourceZ+.168,
    # Z = sourceY+.047. Source positions are already converted mm -> m.
    wrapper=len(gltf['nodes']);gltf['nodes'].append({'name':'skylabs-trainer-source','matrix':[-1,0,0,0,0,0,1,0,0,1,0,0,.540,.168,.047,1],'children':scene['nodes']})
    scene['nodes']=[wrapper];write_glb(target,gltf,binary)
    payload=target.read_bytes();(args.output/'airframe.glb.gz').write_bytes(gzip.compress(payload,compresslevel=9,mtime=0))
    triangle_count=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
    canonical=np.array([[-1,0,0,.540],[0,0,1,.168],[0,1,0,.047],[0,0,0,1]])
    root=next(r for r in parts if not r['parentId']);b=root['boundsMm'];corners=np.array([[b[3 if i&1 else 0]/1000,b[4 if i&2 else 1]/1000,b[5 if i&4 else 2]/1000,1] for i in range(8)]).T
    final=(canonical@corners)[:3]
    manifest={'format':1,'model':'airframe.glb','compressedModel':'airframe.glb.gz','source':{'file':report['sourceFile'],'sha256':report['sourceSha256'],'products':report['sourceProducts']},'units':'metres','axes':{'nose':'+X','up':'+Y','span':'+Z'},'origin':'Wing spar midpoint X=540mm, fuselage centre Y=-47mm, existing main landing gear bottom Z=-168mm in source CAD','sourceToWorldMetres':canonical.tolist(),'sourceInputUnits':'millimetres','bounds':[final.min(axis=1).tolist(),final.max(axis=1).tolist()],'tessellation':{'linearDeflectionMm':.15,'relative':False,'angularDeflectionRadians':.12,'uniqueTriangles':triangle_count,'decimated':False},'asset':{'bytes':len(payload),'gzipBytes':(args.output/'airframe.glb.gz').stat().st_size,'sha256':hashlib.sha256(payload).hexdigest(),'meshes':len(gltf['meshes']),'nodes':len(gltf['nodes'])},'parts':parts,'completion':{'sourceOnly':True,'missing':['Opposite wing half','Opposite horizontal-tail half','Nose-wheel strut and wheel','Heat-shrink film surfaces'],'reconstruction':[]},'telemetryMount':{'position':[0,.200,0],'status':'User requested under wing in middle of fuselage; orientation unrestricted; proposed position not mechanically certified'},'contacts':{'mainGearSourceBottomMm':-168,'groundPlaneY':0,'sourceLevelPropellerClearanceM':-.00415,'note':'Propeller tip lies 4.15mm below main-gear bottom in unpitched source assembly; landing attitude must account for this.'}}
    manifest['sourceToWorldMetres']=(canonical@np.diag([.001,.001,.001,1])).tolist()
    manifest['sourceIntegrity']=source_integrity(gltf,binary,parts)
    manifest['optimization']=compact_report
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:manifest[k] for k in ['bounds','asset','tessellation','completion']},indent=2))
if __name__=='__main__':main()
