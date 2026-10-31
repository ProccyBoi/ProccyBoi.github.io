"""Export supplied competition and mechanism STEP assemblies without invented parts.
Usage: python3 scripts/build-skylabs-competition.py /path/to/cad-source
"""
import sys, json, gzip, hashlib, importlib.util, os
from pathlib import Path
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.Message import Message_ProgressRange
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem, RWMesh_NameFormat
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence
from OCP.XCAFDoc import XCAFDoc_ShapeTool
spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-v3-aircraft-assets.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
for filename,folder in [('Proposal_Assembly.step','skylabs-competition'),('V2 Assembly.step.step','skylabs-mechanism')]:
 source=Path(sys.argv[1])/filename;out=Path('assets/models/aircraft')/folder;out.mkdir(exist_ok=True,parents=True)
 doc,reader,tool,roots=b.inspection.load(source);report=b.inspection.inspect(source,doc,roots)
 records={r['id']:r for r in report['instances']};renamed=set()
 def rename(label):
  definition=TDF_Label()
  if not XCAFDoc_ShapeTool.GetReferredShape_s(label,definition):definition=label
  for item in [label,definition]:
   key=b.inspection.label_id(item)
   if key not in renamed:TDataStd_Name.Set_s(item,TCollection_ExtendedString('cad_'+key.replace(':','_')));renamed.add(key)
  children=TDF_LabelSequence();XCAFDoc_ShapeTool.GetComponents_s(definition,children,False)
  for i in range(1,children.Length()+1):rename(children.Value(i))
 for i in range(1,roots.Length()+1):
  mesh=BRepMesh_IncrementalMesh(XCAFDoc_ShapeTool.GetShape_s(roots.Value(i)),.2,False,.15,True);mesh.Perform()
  if not mesh.IsDone():raise RuntimeError('Tessellation failed')
  rename(roots.Value(i))
 target=out/'assembly.glb';writer=RWGltf_CafWriter(TCollection_AsciiString(str(target)),True)
 writer.SetMergeFaces(True);writer.SetNodeNameFormat(RWMesh_NameFormat.RWMesh_NameFormat_InstanceOrProduct)
 converter=writer.ChangeCoordinateSystemConverter();converter.SetInputLengthUnit(.001);converter.SetOutputLengthUnit(1)
 converter.SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup);converter.SetOutputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup)
 if not writer.Perform(doc,TColStd_IndexedDataMapOfStringString(),Message_ProgressRange()):raise RuntimeError('Export failed')
 optimization=b.compact(target);data,binary=b.read_glb(target);parts=[]
 def annotate(index,parent):
  node=data['nodes'][index];key=parent+[node.get('name','').removeprefix('cad_').replace('_',':')];record=records['/'.join(key)]
  node['name']='cad-'+str(index)+'-'+record['name'];node['extras']={'sourceName':record['name'],'sourceOccurrenceId':record['id']}
  parts.append({**record,'nodeIndex':index,'nodeName':node['name']})
  for child in node.get('children',[]):annotate(child,key)
 for index in data['scenes'][data.get('scene',0)]['nodes']:annotate(index,[])
 assert len(parts)==len(records)
 b.write_glb(target,data,binary);payload=target.read_bytes();(out/'assembly.glb.gz').write_bytes(gzip.compress(payload,mtime=0))
 manifest={'sourceFile':filename,'sourceSha256':report['sourceSha256'],'sourceBytes':source.stat().st_size,'units':'metres; original source axes retained','sourceBoundsMm':parts[0]['boundsMm'],'parts':parts,'optimization':optimization,'linearDeflectionMm':.2,'angularDeflectionRadians':.15,'decimated':False,'assetBytes':len(payload),'gzipBytes':(out/'assembly.glb.gz').stat().st_size,'assetSha256':hashlib.sha256(payload).hexdigest(),'sourceIntegrity':b.source_integrity(data,binary,parts)}

 if 'user.library-file-id' in os.listxattr(source):
  manifest['libraryFileId']=os.getxattr(source,'user.library-file-id').decode()
  manifest['libraryVersion']=int(os.getxattr(source,'user.library-file-version'))
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(folder,len(parts),manifest['assetBytes'],manifest['gzipBytes'],flush=True)
