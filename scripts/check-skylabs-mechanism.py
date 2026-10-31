"""Bounded solid-intersection screen for a proposed downward sensor translation.
Not a joint solver, strength check, tolerance study or flight certification.
"""
import importlib.util,json,sys
from pathlib import Path
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.gp import gp_Trsf,gp_Vec
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFDoc import XCAFDoc_ShapeTool
from OCP.TDF import TDF_Label,TDF_LabelSequence
s=importlib.util.spec_from_file_location('inspect_cad',Path(__file__).with_name('aircraft-inspect.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
doc,reader,tool,roots=m.load(Path(sys.argv[1]));parts=[]
def visit(label,parent):
 definition=TDF_Label()
 if not XCAFDoc_ShapeTool.GetReferredShape_s(label,definition):definition=label
 children=TDF_LabelSequence();XCAFDoc_ShapeTool.GetComponents_s(definition,children,False)
 shape=XCAFDoc_ShapeTool.GetShape_s(label).Moved(parent)
 if not children.Length():parts.append((m.label_name(definition),shape))
 world=parent.Multiplied(XCAFDoc_ShapeTool.GetLocation_s(label))
 for i in range(1,children.Length()+1):visit(children.Value(i),world)
for i in range(1,roots.Length()+1):visit(roots.Value(i),TopLoc_Location())
sensor=next(shape for name,shape in parts if name.startswith('Sensor'));results=[]
for distance in [0,10,20,40,80,120,160]:
 transform=gp_Trsf();transform.SetTranslation(gp_Vec(0,0,-distance));moving=sensor.Moved(TopLoc_Location(transform));hits=[]
 for name,shape in parts:
  if name.startswith('Sensor'):continue
  operation=BRepAlgoAPI_Common(moving,shape);operation.Build()
  if not operation.IsDone():hits.append({'name':name,'error':'Boolean failed'});continue
  props=GProp_GProps();BRepGProp.VolumeProperties_s(operation.Shape(),props);volume=abs(props.Mass())
  if volume>.01:hits.append({'name':name,'intersectionMm3':round(volume,3)})
 results.append({'downwardTravelMm':distance,'intersections':hits})
print(json.dumps({'method':'OpenCascade BRep boolean common; original source solids; sensor-only downward translation sampled at seven positions; >0.01 mm³ threshold. No continuous sweep, tolerances, cable or installed aircraft check.','samples':results},indent=2))
