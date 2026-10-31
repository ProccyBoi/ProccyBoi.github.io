"""Isolate solid 0 of the source Sensor product; solid 1 is a duplicate cart."""
import sys,json,importlib.util,hashlib,gzip
from pathlib import Path
from OCP.TDF import TDF_LabelSequence
from OCP.XCAFDoc import XCAFDoc_ShapeTool,XCAFDoc_DocumentTool
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TCollection import TCollection_ExtendedString,TCollection_AsciiString
from OCP.TDocStd import TDocStd_Document
from OCP.XCAFApp import XCAFApp_Application
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import RWMesh_CoordinateSystem
from OCP.TColStd import TColStd_IndexedDataMapOfStringString
from OCP.Message import Message_ProgressRange
s=importlib.util.spec_from_file_location('cad',Path(__file__).with_name('aircraft-inspect.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
doc,reader,tool,roots=m.load(Path(sys.argv[1]));children=TDF_LabelSequence();XCAFDoc_ShapeTool.GetComponents_s(roots.Value(1),children,False);shape=XCAFDoc_ShapeTool.GetShape_s(children.Value(10));solids=[];ex=TopExp_Explorer(shape,TopAbs_SOLID)
while ex.More():solids.append(ex.Current());ex.Next()
assert len(solids)==2
out=Path('assets/models/aircraft/skylabs-mechanism');d=TDocStd_Document(TCollection_ExtendedString('sensor'));XCAFApp_Application.GetApplication_s().NewDocument(TCollection_ExtendedString('MDTV-XCAF'),d);st=XCAFDoc_DocumentTool.ShapeTool_s(d.Main());st.AddShape(solids[0],False)
mesh=BRepMesh_IncrementalMesh(solids[0],.10,False,.1,True);mesh.Perform();target=out/'sensor-body.glb';w=RWGltf_CafWriter(TCollection_AsciiString(str(target)),True);w.SetMergeFaces(True);c=w.ChangeCoordinateSystemConverter();c.SetInputLengthUnit(.001);c.SetOutputLengthUnit(1);c.SetInputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup);c.SetOutputCoordinateSystem(RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Yup);assert w.Perform(d,TColStd_IndexedDataMapOfStringString(),Message_ProgressRange());(out/'sensor-body.glb.gz').write_bytes(gzip.compress(target.read_bytes(),mtime=0))
info={'sourceOccurrence':'0:1:1:1/0:1:1:1:10','solid0':'Actual 300 mm sensor body','solid1':'Duplicate Cart V2 geometry embedded in Sensor product; hidden, original independent Cart V2 retained','solidBoundsMm':[m.bounds(s) for s in solids],'frontDirectionInMechanismSource':'+X (rounded nose; tapered tail at -X)','frontNotch':{'centreMm':[61.540941309766,-45.7201238048,57.815001],'radiusMm':1.5,'axis':'+X','endFaceXMm':[58.540941309766,64.540941309766],'evidence':'Source BRep circular edges, 1.5 mm radius at both notch faces; matching 3 mm outer recess'},'assetSha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(out/'sensor-identification.json').write_text(json.dumps(info,indent=2)+'\n');print(info)
