"""Inspect the supplied aircraft STEP without modifying source CAD."""
from __future__ import annotations
import argparse, hashlib, json, re
from pathlib import Path
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.TCollection import TCollection_ExtendedString, TCollection_AsciiString
from OCP.TDataStd import TDataStd_Name
from OCP.TDF import TDF_Label, TDF_LabelSequence, TDF_Tool
from OCP.TDocStd import TDocStd_Document
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool

def label_id(label):
    value=TCollection_AsciiString(); TDF_Tool.Entry_s(label,value); return value.ToCString()

def label_name(label):
    value=TDataStd_Name()
    return value.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(),value) else ''

def bounds(shape):
    box=Bnd_Box(); BRepBndLib.AddOptimal_s(shape,box,False,False)
    return None if box.IsVoid() else [round(float(v),6) for v in box.Get()]

def matrix(location):
    transform=location.Transformation()
    return [[transform.Value(r,c) for c in range(1,5)] for r in range(1,4)]+[[0,0,0,1]]

def load(source):
    document=TDocStd_Document(TCollection_ExtendedString('aircraft'))
    XCAFApp_Application.GetApplication_s().NewDocument(TCollection_ExtendedString('MDTV-XCAF'),document)
    reader=STEPCAFControl_Reader();reader.SetNameMode(True);reader.SetColorMode(True)
    if reader.ReadFile(str(source))!=IFSelect_RetDone or not reader.Transfer(document): raise RuntimeError('STEP transfer failed')
    tool=XCAFDoc_DocumentTool.ShapeTool_s(document.Main());roots=TDF_LabelSequence();tool.GetFreeShapes(roots)
    return document,reader,tool,roots

def inspect(source,document,roots):
    records=[]
    def visit(label,parent_location,parent_path):
        definition=TDF_Label()
        if not XCAFDoc_ShapeTool.GetReferredShape_s(label,definition): definition=label
        occurrence=label_id(label);name=label_name(definition);path=parent_path+[occurrence]
        local=XCAFDoc_ShapeTool.GetLocation_s(label);world=parent_location.Multiplied(local)
        shape=XCAFDoc_ShapeTool.GetShape_s(label).Moved(parent_location)
        children=TDF_LabelSequence();XCAFDoc_ShapeTool.GetComponents_s(definition,children,False)
        records.append({'id':'/'.join(path),'occurrenceLabel':occurrence,'productLabel':label_id(definition),'occurrenceName':label_name(label),'name':name,'parentId':'/'.join(parent_path) or None,'assembly':children.Length()>0,'boundsMm':bounds(shape),'localMatrixMm':matrix(local),'worldMatrixMm':matrix(world)})
        for i in range(1,children.Length()+1):visit(children.Value(i),world,path)
    for i in range(1,roots.Length()+1):visit(roots.Value(i),TopLoc_Location(),[])
    text=source.read_text(encoding='utf-8')
    products=[{'stepEntityId':int(m[1]),'id':m[2],'name':m[3]} for m in re.finditer(r"#(\d+)=PRODUCT\('([^']*)',\s*'([^']*)'",text)]
    return {'sourceFile':source.name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'units':'millimetres after OpenCascade STEP transfer','sourceProducts':products,'roots':[r['id'] for r in records if not r['parentId']],'instances':records}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('.codex-temp/aircraft/inspection.json'));args=parser.parse_args()
    document,reader,tool,roots=load(args.source);report=inspect(args.source,document,roots)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'source':report['sourceFile'],'products':len(report['sourceProducts']),'instances':len(report['instances']),'topLevels':[{k:r[k] for k in ['name','id','boundsMm','assembly']} for r in report['instances'] if not r['parentId'] or r['parentId'] in report['roots']]},indent=2))
if __name__=='__main__':main()
