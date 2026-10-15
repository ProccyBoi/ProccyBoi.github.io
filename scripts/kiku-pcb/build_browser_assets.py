"""Create a source-grounded browser PCB with native KiCad faces and licensed models.

Input GLBs are KiCad 9.0.2 exports of the unmodified public board at origin
72.11x157.90mm. This script only writes to its own directory. It never executes
source-repository code and never copies excluded local third-party CAD.
"""
from pathlib import Path
import json, struct, hashlib, collections, math, gzip, argparse
import numpy as np
from scipy.spatial.transform import Rotation
parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,required=True)
parser.add_argument('--work-root',type=Path,required=True)
parser.add_argument('--output-root',type=Path,default=Path(__file__).resolve().parents[2]/'assets/models/kiku-pcb')
args=parser.parse_args()
ROOT=args.work_root;SOURCE=args.source_root;OUTPUT=args.output_root
OUTPUT.mkdir(parents=True,exist_ok=True)
DATUMS=json.loads((SOURCE/'Mechanical/reference/board_datums.json').read_text())
FPS={f['ref']:f for f in DATUMS['footprints']}
ENVS={e['ref']:e for e in json.loads((SOURCE/'Mechanical/reference/component_envelopes.json').read_text())}
SOURCES=json.loads((ROOT/'official-model-sources.json').read_text())
LIBRARY={r['path']:r for r in SOURCES}
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
# Native KiCad glTF: X right, Y front, Z down, metres. Target: X right, Y up,
# Z front, millimetres. This is a proper rotation; triangle winding is preserved.
AXIS=np.array([[1,0,0],[0,0,-1],[0,1,0]],dtype=float)

def read_glb(path):
 b=Path(path).read_bytes();magic,version,size=struct.unpack_from('<III',b)
 assert magic==0x46546c67 and version==2 and size==len(b)
 jl,jt=struct.unpack_from('<II',b,12);j=json.loads(b[20:20+jl]);offset=20+jl
 bl,bt=struct.unpack_from('<II',b,offset);blob=b[offset+8:offset+8+bl]
 def array(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']]
  d={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
  k={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
  item=np.dtype(d).itemsize
  return np.ndarray((a['count'],k),dtype=d,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',item*k),item))
 return j,array

def merge(pieces):
 ps=[]; ns=[]; ix=[]; at=0
 for p,n,i in pieces:
  ps.append(p);ns.append(n);ix.append(i+at);at+=len(p)
 p=np.concatenate(ps);n=np.concatenate(ns);i=np.concatenate(ix)
 # Remove unused vertices and byte-identical duplicated position/normal tuples.
 packed=np.ascontiguousarray(np.column_stack([p,n]),dtype='<f4')
 used,inv=np.unique(i,return_inverse=True);packed=packed[used];i=inv.reshape(-1,3)
 unique,inv=np.unique(packed,axis=0,return_inverse=True)
 return unique[:,:3],unique[:,3:],inv[i].astype('<u4')

def rgb_hex(rgb):
 # glTF factors are linear; current site accepts an sRGB hex color then linearizes.
 srgb=[12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055 for x in rgb]
 return '#'+''.join(f'{round(max(0,min(1,x))*255):02x}' for x in srgb)

def native_material(mat,kind):
 m=mat.get('pbrMetallicRoughness',{});rgba=m.get('baseColorFactor',[.5,.5,.5,1])
 # Preserve upstream colors. PBR defaults are display choices where STEP has no PBR.
 return {'color':rgb_hex(rgba[:3]),'colorLinear':rgba[:3], 'opacity':rgba[3],
         'roughness':m.get('roughnessFactor',.68),'metalness':m.get('metallicFactor',.05),
         'doubleSided':True,'materialSource':'KiCad 9.0.2 export material; roughness/metalness defaults where absent'}

batches=collections.defaultdict(list);batchmeta={};componentmeta={};checks=[];segments=collections.defaultdict(list);segment_ends=collections.defaultdict(int)
def segment(key,ref,count):
 if segments[key] and segments[key][-1]['ref']==ref:
  segments[key][-1]['triangleCount']+=int(count)
 else:
  segments[key].append({'ref':ref,'firstTriangle':segment_ends[key],'triangleCount':int(count)})
 segment_ends[key]+=int(count)
# Board layers. Retain horizontal copper/pad/via surfaces; micrometre-thick vertical
# walls of those coatings are intentionally omitted for browser cost. Substrate,
# drill bores, silkscreen and mask remain native KiCad tessellations.
j,arr=read_glb(ROOT/'board.glb')
for mesh in j['meshes']:
 kind=mesh['name'].rsplit('_',1)[-1].lower();key='pcb_'+kind;pieces=[];omitted=0
 for prim in mesh['primitives']:
  p=arr(prim['attributes']['POSITION']).astype(float)@AXIS.T*1000
  n=arr(prim['attributes']['NORMAL']).astype(float)@AXIS.T
  i=arr(prim['indices']).reshape(-1,3).astype(np.int64)
  if kind in ('copper','pad','via'):
   flat=np.ptp(p[i][:,:,2],axis=1)<.00001
   omitted+=int((~flat).sum());i=i[flat]
  if len(i):pieces.append((p,n,i))
 if not pieces:continue
 batches[key]+=pieces
 material=native_material(j['materials'][mesh['primitives'][0]['material']],kind)
 if kind=='pcb':
  # Laminate color is a visible editorial finish, not a manufacturing specification.
  material.update(color='#274a35',colorLinear=None,roughness=.75,metalness=0)
 material.update({'group':'pcb','name':{'pcb':'Board substrate','pad':'Solder pads','via':'Vias','copper':'Copper traces and pours','silkscreen':'Silkscreen','soldermask':'Soldermask'}.get(kind,kind),
  'description':'Native KiCad board geometry in original mechanical coordinates','fidelity':'source-board-tessellation','source':'Walkman - Blobject.kicad_pcb','omittedCoatingSidewallTriangles':omitted})
 batchmeta[key]=material

# Model export is only used for local triangulations/materials. Its instance
# transforms are used faithfully with an explicit +0.005mm placement calibration.
j,arr=read_glb(ROOT/'components.glb')
for node in j['nodes']:
 ref=node.get('name');f=FPS.get(ref)
 if not f or 'mesh' not in node:continue
 assert f['layer']=='F.Cu' and len(f['models'])==1
 model=f['models'][0];assert 'KICAD9_3DMODEL_DIR' in model['path']
 rot=Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix()
 scale=np.array(node.get('scale',[1,1,1]));t=np.array(node.get('translation',[0,0,0]))
 assert np.allclose(model['scale'],[1,1,1])
 points=[]
 for prim in j['meshes'][node['mesh']]['primitives']:
  local=arr(prim['attributes']['POSITION']).astype(float)
  p=((local*scale)@rot.T+t)@AXIS.T*1000;p[:,2]+=.005
  n=(arr(prim['attributes']['NORMAL']).astype(float)@rot.T)@AXIS.T
  i=arr(prim['indices']).reshape(-1,3).astype(np.int64)
  key='pcb_official_material_'+str(prim['material']);batches[key].append((p,n,i));points.append(p);segment(key,ref,len(i))
  if key not in batchmeta:
   batchmeta[key]={**native_material(j['materials'][prim['material']],'component'),'group':'pcb','name':'Official component models','description':'Official KiCad 9.0.2 component geometry; original placement and color','fidelity':'official-library-model','componentRefs':[]}
  if ref not in batchmeta[key]['componentRefs']:batchmeta[key]['componentRefs'].append(ref)
 p=np.concatenate(points);bounds=[*p.min(0),*p.max(0)]
 expected=np.array(ENVS[ref]['bounds']);err=float(np.max(np.abs(np.array(bounds)-expected)))
 rec={'ref':ref,'value':f['value'],'footprint':f['footprint'],'fidelity':'official-library-model','sourceExpression':model['path'],'librarySource':LIBRARY[model['path'].split('}/',1)[1]],'bounds':bounds,'reviewedBounds':expected.tolist(),'maximumReviewedBoundDeviationMm':err,
 'sourcePlacement':{'pcbXY':f['xy'],'footprintAngleDegrees':f['angle'],'layer':f['layer'],'modelOffset':model['offset'],'modelRotationDegrees':model['rotation'],'modelScale':model['scale']},'assemblyPlacement':[f['xy'][0]-72.11,157.9-f['xy'][1],1.6]}
 componentmeta[ref]=rec;checks.append((ref,err))

# Exact recorded bounding envelopes only. No invented vendor topology, holes,
# pins, surface labels or claimed fit geometry is introduced.
def box(bounds):
 x0,y0,z0,x1,y1,z1=bounds
 corners=np.array([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],float)
 faces=[([0,3,2,1],[0,0,-1]),([4,5,6,7],[0,0,1]),([0,1,5,4],[0,-1,0]),([1,2,6,5],[1,0,0]),([2,3,7,6],[0,1,0]),([3,0,4,7],[-1,0,0])]
 p=[];n=[];i=[]
 for ids,normal in faces:
  at=len(p);p.extend(corners[ids]);n.extend([normal]*4);i.extend([[at,at+1,at+2],[at,at+2,at+3]])
 return np.array(p),np.array(n),np.array(i)
for ref,e in ENVS.items():
 if ref in componentmeta:continue
 f=FPS[ref];model=f['models'][0]
 assert 'KIPRJMOD' in model['path'] or ref=='D3'
 color='#4a4c4c' if ref.startswith(('U','Q','IC','D','L')) else '#9da59d' if ref.startswith(('J','X')) else '#cbc7a7' if ref.startswith('FPC') else '#494f4c'
 key='pcb_envelope_'+color[1:];batches[key].append(box(e['bounds']));segment(key,ref,12)
 if key not in batchmeta:batchmeta[key]={'color':color,'opacity':1,'roughness':.72,'metalness':.05,'doubleSided':True,'group':'pcb','name':'Source-documented component envelopes','description':'Bounding-envelope proxies from the public reviewed metadata; missing local/vendor CAD is not redistributed','fidelity':'source-envelope-proxy','componentRefs':[],'materialSource':'Editorial neutral package colors; not a manufacturer finish specification'}
 batchmeta[key]['componentRefs'].append(ref)
 componentmeta[ref]={'ref':ref,'value':f['value'],'footprint':f['footprint'],'fidelity':'unverified-source-allowance' if ref=='D3' else 'source-envelope-proxy','sourceExpression':model['path'],'source':'Mechanical/reference/component_envelopes.json','originalReferenceKind':e['kind'],'bounds':e['bounds'],'reviewedBounds':e['bounds'],'maximumReviewedBoundDeviationMm':0,'missingGeometry':'No vendor surfaces, pins, connector internals or actuator topology supplied; rectangular reviewed envelope only',
 'sourcePlacement':{'pcbXY':f['xy'],'footprintAngleDegrees':f['angle'],'layer':f['layer'],'modelOffset':model['offset'],'modelRotationDegrees':model['rotation'],'modelScale':model['scale']},'assemblyPlacement':[f['xy'][0]-72.11,157.9-f['xy'][1],1.6]}

blob=bytearray();parts=[];meshcache={}
def pack(a,dtype,itemsize):
 a=np.ascontiguousarray(a,dtype=dtype)
 while len(blob)%4:blob.append(0)
 o=len(blob);blob.extend(a.tobytes())
 return {'byteOffset':o,'byteLength':a.nbytes,'count':a.size//itemsize,'itemSize':itemsize,'componentType':'FLOAT' if dtype=='<f4' else 'UNSIGNED_INT'}
for key,pieces in batches.items():
 p,n,i=merge(pieces);assert np.isfinite(p).all() and np.isfinite(n).all() and i.max()<len(p)
 lo=p.min(0);hi=p.max(0)
 part={'id':key,**batchmeta[key],'explode':[0,0,0],'bounds':[lo.tolist(),hi.tolist()],'size':(hi-lo).tolist(),'vertices':len(p),'triangles':len(i),'position':pack(p,'<f4',3),'normal':pack(n,'<f4',3),'index':pack(i,'<u4',1)}
 
 parts.append(part);meshcache[key]=(p,n,i)
(OUTPUT/'pcb.bin').write_bytes(blob)
(OUTPUT/'pcb.bin.gz').write_bytes(gzip.compress(blob,compresslevel=9,mtime=0))
lo=np.min([p['bounds'][0] for p in parts],axis=0);hi=np.max([p['bounds'][1] for p in parts],axis=0)
counts={'footprints':len(FPS),'modelReferences':len(ENVS),'officialLibraryMeshes':sum(c['fidelity']=='official-library-model' for c in componentmeta.values()),'vendorEnvelopeProxies':sum(c['fidelity']=='source-envelope-proxy' for c in componentmeta.values()),'unverifiedAllowances':sum(c['fidelity']=='unverified-source-allowance' for c in componentmeta.values()),'footprintsWithoutModel':sum(not f['models'] for f in FPS.values())}
manifest={'schema':'kiku-pcb-v1','revision':'Public board d0c4d9ea34297d8671f464dedc6018189c33ea76','units':'millimetres','coordinateSystem':{'x':'right','y':'up','z':'front'},'geometry':'Native KiCad board surfaces, 111 official-library component instances, 21 source-envelope proxies, and the documented D3 allowance. No excluded vendor CAD.','binary':'pcb.bin','binaryBytes':len(blob),'binarySha256':sha(OUTPUT/'pcb.bin'),'binaryGzip':'pcb.bin.gz','binaryGzipBytes':(OUTPUT/'pcb.bin.gz').stat().st_size,'binaryGzipSha256':sha(OUTPUT/'pcb.bin.gz'),'bounds':[lo.tolist(),hi.tolist()],'center':((lo+hi)/2).tolist(),'size':(hi-lo).tolist(),'partCount':len(parts),'triangles':sum(p['triangles'] for p in parts),'counts':counts,'componentCount':len(componentmeta),'group':'pcb','provenance':'pcb-provenance.json','parts':parts}
(OUTPUT/'pcb.json').write_text(json.dumps(manifest,indent=2)+'\n')
prov={'schema':'kiku-pcb-provenance-v1','sourceRepository':'https://github.com/ProccyBoi/kiku','sourceCommit':'d0c4d9ea34297d8671f464dedc6018189c33ea76','generatedFrom':{p:sha(SOURCE/p) for p in ['Walkman - Blobject.kicad_pcb','Mechanical/reference/board_datums.json','Mechanical/reference/component_envelopes.json','Mechanical/reference/pcb_bare.step']},'datumsRecordedBoardHash':DATUMS['sha256'],'counts':counts,
'coordinateSystem':{'units':'millimetres','kicadToMechanical':'X=Xpcb-72.11; Y=157.90-Ypcb; Z toward front','glbToMechanical':'[X,Y,Z]=1000*[glbX,-glbZ,glbY]','frontComponentDatumMm':1.6,'nativeExportFrontComponentDatumMm':1.595,'documentedPlacementCalibrationMm':[0,0,.005],'boardDesignThicknessMm':DATUMS['board_thickness'],'nativeExportSubstrateBoundsMm':[0,0,0,60,105,1.51],'explanation':'Native KiCad 9.0.2 separates the 1.51 mm substrate from copper/mask coatings. The checked-in bare STEP also has 1.51 mm body thickness. Components use the independently reviewed 1.60 mm mounting datum via an explicit +0.005 mm correction to native GLB instance placement. No XY recentering or scaling is applied.'},
'fidelityNotes':['111 placed component instances use the exact paths from the official KiCad 9.0.2 library, tessellated by KiCad 9.0.2. Historical upstream model hashes were not recorded; same filename is not a guarantee of identical historical geometry. Bounds comparison below makes revision changes visible.','21 excluded local/vendor references use axis-aligned boxes with the exact published reviewed bounds; these are documented package envelopes, not recovered or exact vendor models.','D3 uses its existing documented UNVERIFIED source allowance because the referenced official release path returns 404.','142 footprint placement records and 133 model transforms match current KiCad source, despite a different historical board hash in board_datums.json.','Native copper, pads, vias, silkscreen, soldermask and substrate are retained. Sub-millimetre vertical coating sidewalls are omitted while the source top/bottom surface shapes, source holes and laminate thickness remain unchanged.','All component materials retain native official model colors where available; neutral envelope and laminate finishes and PBR roughness defaults are display choices, not manufacturing specifications.','Ubuntu Mono 0.83 from the official Ubuntu asset archive was used locally to avoid font substitution; only generated board artwork is delivered.'],
'unsupportedFeatures':['Exact local/vendor component solids, connector internals, actuator topologies and pin surfaces for 21 excluded references','Internal copper layers and electrical connectivity animation','Nine footprints with no assigned 3D model, such as mounting holes and fiducials; their board/pad features remain','Physical assembly validation, component-vendor model revision equivalence, and fit/performance certification'],
'licenses':{'hardware':'CERN-OHL-P-2.0; source project LICENSE and LICENSES/CERN-OHL-P-2.0.txt','officialModels':'KiCad library CC-BY-SA-4.0 with design/generated-file exception','officialModelLicenseUrl':'https://www.kicad.org/libraries/license/','libraryReleaseUrl':'https://gitlab.com/kicad/libraries/kicad-packages3D/-/tree/9.0.2','font':'Ubuntu Font Licence 1.0; used only for source board label rendering','fontSourceUrl':'https://assets.ubuntu.com/v1/0cef8205-ubuntu-font-family-0.83.zip'},'components':sorted(componentmeta.values(),key=lambda x:x['ref']),'componentTriangleRangesByMesh':dict(segments),'validation':{'maximumOfficialReviewedBoundDeviationMm':max(e for _,e in checks),'officialBoundsDeviationsOver0_05mm':[{'ref':r,'maximumDeviationMm':e} for r,e in checks if e>.05],'indicesValid':True,'finiteAttributes':True,'coordinatesUnrecentered':True,'nativeMaterialsKeptSeparate':True,'bufferFourByteAligned':True}}
(OUTPUT/'pcb-provenance.json').write_text(json.dumps(prov,indent=2)+'\n')
(OUTPUT/'KICAD-LIBRARY-LICENSE.md').write_bytes((ROOT/'kicad-models/LICENSE.md').read_bytes())
(OUTPUT/'CERN-OHL-P-2.0.txt').write_bytes((SOURCE/'LICENSES/CERN-OHL-P-2.0.txt').read_bytes())
print(json.dumps({'bytes':len(blob),'triangles':manifest['triangles'],'parts':len(parts),'counts':counts,'validation':prov['validation']},indent=2))
# Store reproducible geometry for an independent offscreen review renderer.
np.savez_compressed(ROOT/'review-meshes.npz',**{key+'_'+name:arr for key,mesh in meshcache.items() for name,arr in zip(['position','normal','index'],mesh)})
