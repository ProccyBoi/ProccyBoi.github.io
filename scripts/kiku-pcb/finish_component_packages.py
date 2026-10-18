# SPDX-License-Identifier: MIT
"""Replace historical PCB envelope boxes with inspectable, licensed package meshes.

Retains native KiCad geometry byte-for-byte at the attribute level. The only added
upstream mesh is KiCad's licensed LQFP-100 package (not a recovered vendor model).
Other shapes are independent visual reconstructions from public dimensions and
source pads. They are deliberately NOT mechanical fit/production models.

Run after build_browser_assets.py. Re-running is deterministic and safe.
"""
from pathlib import Path
from collections import defaultdict
import argparse, copy, gzip, hashlib, json, math, re, urllib.request
import numpy as np

P=argparse.ArgumentParser()
P.add_argument('--source-root',type=Path,required=True)
P.add_argument('--output-root',type=Path,default=Path(__file__).resolve().parents[2]/'assets/models/kiku-pcb')
P.add_argument('--work-root',type=Path,required=True)
A=P.parse_args();OUT=A.output_root;A.work_root.mkdir(parents=True,exist_ok=True)
SRC=A.source_root
FP={f['ref']:f for f in json.loads((SRC/'Mechanical/reference/board_datums.json').read_text())['footprints']}
ENV={e['ref']:e for e in json.loads((SRC/'Mechanical/reference/component_envelopes.json').read_text())}
manifest=json.loads((OUT/'pcb.json').read_text());prov=json.loads((OUT/'pcb-provenance.json').read_text())
oldblob=(OUT/'pcb.bin').read_bytes();sha=lambda b:hashlib.sha256(b).hexdigest()
assert sha(oldblob)==manifest['binarySha256']
records={c['ref']:c for c in prov['components']}
targets={r for r,c in records.items() if c['fidelity']!='official-library-model'}
assert targets=={'D2','D3','FPC1','IC1','J1','J3','L1','L2','Q1','SW1','SW2','SW3','SW4','U1','U2','U3','U5','U7','U9','U10','X1','X2'}
SOURCE_URL='https://github.com/ProccyBoi/kiku/blob/d0c4d9ea34297d8671f464dedc6018189c33ea76/'
DRAWINGS={
 'U1':{'url':'https://ww1.microchip.com/downloads/aemDocuments/documents/WSG/ProductDocuments/DataSheets/BM83-Bluetooth-Stereo-Audio-Module-Data-Sheet-DS70005402.pdf','location':'Figure 8-1, page 56','facts':'15 x 32 x 2.5 mm module; PCB 0.6 mm; shield ends 22 mm along length; antenna zone at mechanical +X.'},
 'SW2':{'url':'https://www.bourns.com/docs/product-datasheets/pec11l.pdf','location':'Product dimensions, page 2','facts':'11.8 x 12.0 x 4.5 mm body; 6 mm D shaft, 4.5 mm flat; M7 bushing. BOM PEC11L and source PEC11R footprint/model disagree; historical envelope retained.'},
 'J1':{'url':'https://datasheet.lcsc.com/datasheet/pdf/9e56b777c022540fcce7c7f67825f55e.pdf?productCode=C165948','location':'HRO TYPE-C-31-M-12 manufacturer drawing, 2020-12-08','facts':'8.94 x 7.35 x 3.26 mm shell; 8.34 x 2.56 mm mouth; shell-leg centers 8.64 mm across / 4.18 mm longitudinal. Current HRO page calls height 3.16 mm, so source-envelope revision uncertainty remains.'},
 'FPC1':{'url':'https://datasheet.lcsc.com/datasheet/pdf/1c6129ba5fa7da3b6a4c8e044c2574b1.pdf?productCode=C479750','location':'ATOM drawing ATOM-A01135 revision C, F050**-09***','facts':'12 contacts at 0.5 mm pitch; 5.5 mm contact span; 6.6 mm cable mouth; 5.95 mm depth; 2 mm height. Source 10.72007 mm width retained rather than 10.90 mm max drawing ears.'},
}
MATERIALS={
 'mold':('#25282b',.68,.02),'mold_edge':('#35383b',.66,.02),'silver':('#c3c8ce',.31,.82),
 'steel':('#929aa3',.4,.78),'gold':('#d8b45b',.3,.78),'ivory':('#e4dfc8',.55,.02),
 'ceramic':('#bcb7a4',.62,.03),'green':('#234b38',.67,.02),'ferrite':('#41464b',.8,.04),
 'mark':('#a9adb0',.72,.02),'cavity':('#0d1217',.86,0),
}
# A mesh is accumulated with split face normals, avoiding any dependency on a CAD
# kernel and preventing averaged normals from rounding intended package edges.
batches=defaultdict(list);segments=defaultdict(list);metadata={};details=defaultdict(list)
current=None

def emit(mat,points,faces):
 p=np.asarray(points,float);out=[];norm=[]
 for face in faces:
  for k in range(1,len(face)-1):
   tri=p[[face[0],face[k],face[k+1]]];n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);length=np.linalg.norm(n)
   if length<1e-10:continue
   out.extend(tri);norm.extend([n/length]*3)
 if not out:return
 p=np.array(out);n=np.array(norm);i=np.arange(len(p),dtype=np.uint32).reshape(-1,3)
 key='pcb_package_'+mat
 batches[key].append((current,p,n,i))

def box(mat,b):
 x0,y0,z0,x1,y1,z1=map(float,b)
 assert x1>x0 and y1>y0 and z1>z0,(current,b)
 p=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]
 emit(mat,p,[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])

def poly_rect(cx,cy,w,h,r,n=5):
 r=min(r,w/2,h/2)
 if r<1e-8:return np.array([[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]])
 pts=[]
 for x,y,start in [(cx+w/2-r,cy+h/2-r,0),(cx-w/2+r,cy+h/2-r,90),(cx-w/2+r,cy-h/2+r,180),(cx+w/2-r,cy-h/2+r,270)]:
  for a in np.linspace(start,start+90,n+1):pts.append([x+r*math.cos(math.radians(a)),y+r*math.sin(math.radians(a))])
 return np.array(pts)

def prism(mat,poly,z0,z1):
 poly=np.array(poly);N=len(poly);p=[[*q,z0] for q in poly]+[[*q,z1] for q in poly]
 faces=[list(range(N-1,-1,-1)),list(range(N,N*2))]
 faces += [[k,(k+1)%N,(k+1)%N+N,k+N] for k in range(N)]
 emit(mat,p,faces)

def rounded(mat,cx,cy,w,h,z0,z1,r=.2):prism(mat,poly_rect(cx,cy,w,h,r),z0,z1)

def cylinder(mat,cx,cy,r,z0,z1,n=48,flat=None):
 # Positive winding, optionally clipped to a D flat on the +Y side.
 poly=np.array([[cx+r*math.cos(2*math.pi*k/n),cy+r*math.sin(2*math.pi*k/n)] for k in range(n)])
 if flat is not None:
  out=[]
  for a,b in zip(poly,np.roll(poly,-1,axis=0)):
   ai=a[1]<=cy+flat;bi=b[1]<=cy+flat
   if ai:out.append(a)
   if ai!=bi:out.append(a+(b-a)*((cy+flat-a[1])/(b[1]-a[1])))
  poly=np.array(out)
 prism(mat,poly,z0,z1)

def ring(mat,cx,cy,ro,ri,z0,z1,n=48):
 outer=np.array([[cx+ro*math.cos(2*math.pi*k/n),cy+ro*math.sin(2*math.pi*k/n)] for k in range(n)])
 inner=np.array([[cx+ri*math.cos(2*math.pi*k/n),cy+ri*math.sin(2*math.pi*k/n)] for k in range(n)])
 tube(mat,outer,inner,z0,z1)

def tube(mat,outer,inner,z0,z1,axis='z'):
 N=len(outer);assert len(inner)==N
 p=[[*q,z] for z in (z0,z1) for loop in (outer,inner) for q in loop]
 if axis=='y':p=[[x,z,-y] for x,y,z in p] # rotation about X; determinant +1
 fs=[]
 for k in range(N):
  j=(k+1)%N
  fs += [[k,j,2*N+j,2*N+k],[N+j,N+k,3*N+k,3*N+j],[j,k,N+k,N+j],[2*N+k,2*N+j,3*N+j,3*N+k]]
 emit(mat,p,fs)

def pins(ref,z0=1.6,z1=1.8,scale=.75,clip=None,mat='silver'):
 f=FP[ref]
 seen=set()
 for pad in f['pads']:
  if not pad['number']:continue
  x=pad['xy'][0]-72.11;y=157.9-pad['xy'][1]
  # Source pad sizes are in the footprint's local frame. Convert widths through
  # the actual footprint angle, never assume global XY from size alone.
  a=math.radians(f['angle']);sx,sy=pad['size'];w=abs(math.cos(a))*sx+abs(math.sin(a))*sy;h=abs(math.sin(a))*sx+abs(math.cos(a))*sy
  key=(round(x,6),round(y,6))
  if key in seen:continue
  seen.add(key)
  x0=x-w*scale/2;x1=x+w*scale/2;y0=y-h*scale/2;y1=y+h*scale/2
  if clip is not None:
   x0=max(x0,clip[0]);y0=max(y0,clip[1]);x1=min(x1,clip[3]);y1=min(y1,clip[4])
  if x1>x0 and y1>y0:box(mat,[x0,y0,z0,x1,y1,z1])

def bump_mark(x,y,r,z):cylinder('mark',x,y,r,z,z+.008,24)

def reconstruct(ref):
 global current
 current=ref;f=FP[ref];x0,y0,z0,x1,y1,z1=ENV[ref]['bounds'];cx=(x0+x1)/2;cy=(y0+y1)/2;w=x1-x0;h=y1-y0;d=z1-z0;b=[x0,y0,z0,x1,y1,z1]
 if ref in ['SW3','SW4']:
  rounded('mold',cx,cy,12,12,z0,z0+3.2,.65)
  rounded('silver',cx,cy,11.5,11.5,z0+3.2,z0+3.55,.55)
  ring('steel',cx,cy,3.9,2.8,z0+3.55,z0+3.85)
  cylinder('mold',cx,cy,2.8,z0+3.4,z1)
  for dx in (-4.6,4.6):
   for dy in (-4.6,4.6):cylinder('steel',cx+dx,cy+dy,.6,z0+3.55,z0+3.8,24)
  # Four bent solder lugs terminate exactly at the recorded package envelope.
  for side in (-1,1):
   for yy in (-2.5,2.5):
    box('silver',[cx+side*6-.16,cy+yy-.5,z0+.2,cx+side*6+.16,cy+yy+.5,z0+2.1])
    xx0,xx1=(x0,cx-5.7) if side<0 else (cx+5.7,x1)
    box('silver',[xx0,cy+yy-.5,z0,xx1,cy+yy+.5,z0+.25])
  details[ref]=['12 x 12 mm moulded base','formed top plate and four retention rivets','round actuator reaching recorded 12 mm package height','four bent solder lugs aligned with source pad rows']
 elif ref=='SW1':
  rounded('mold',cx,cy,2.9,3.9,z0,z0+1.05,.23)
  rounded('silver',cx,cy,2.65,3.65,z0+1.05,z0+1.23,.18)
  cylinder('mold',cx,cy,.8,z0+1.23,z1,32)
  box('silver',[cx-.45,y0,z0,cx+.45,y0+.7,z0+.22]);box('silver',[cx-.45,y1-.7,z0,cx+.45,y1,z0+.22])
  details[ref]=['source-oriented 3.9 x 3.0 mm switch package','metal cover, circular actuator and two solder terminals']
 elif ref=='SW2':
  rounded('mold',cx,cy,11.8,12,z0+3.50012,5.6,.35)
  rounded('silver',cx,cy,11.8,12,5.6,6.1,.35)
  # Front cover relief and fastening tabs.
  cylinder('steel',cx,cy,4.5,6.1,6.35)
  cylinder('silver',cx,cy,3.5,6.35,12.7)
  for z in np.arange(6.8,12.6,.75):ring('steel',cx,cy,3.52,3.38,float(z),float(z+.16))
  cylinder('steel',cx,cy,3,12.7,16.1)
  cylinder('silver',cx,cy,3,16.1,z1,64,flat=1.5)
  for side in (-1,1):
   xx0,xx1=(x0,x0+.42) if side<0 else (x1-.42,x1)
   box('steel',[xx0,cy-1.3,z0,xx1,cy+1.5,5.75])
   box('silver',[min(cx+side*5.9,cx+side*6.25),cy-1.3,5.4,max(cx+side*5.9,cx+side*6.25),cy+1.5,5.9])
  for pad in f['pads']:
   if pad['number'].startswith('MT'):continue
   x=pad['xy'][0]-72.11;y=157.9-pad['xy'][1]
   box('silver',[x-.25,max(y0,y-.1),z0,x+.25,min(y1,y+.1),2.4])
  details[ref]=['moulded switch/encoder body and formed metal cover','M7-size bushing with visible thread relief','6 mm D-profile shaft','five source-positioned through-hole terminals and two mounting tabs','historical source Z21.10009 extent retained; PEC11L/PEC11R footprint and shaft-length conflict remains unverified']
 elif ref=='U1':
  rounded('green',cx,cy,w,h,z0,z0+.6,.12)
  # The public Microchip drawing puts the RF shield at the left 22 mm;
  # the right-most 10 mm remains an exposed antenna zone.
  sx0=x0+.5;sx1=x0+22;sy0=y0+.5;sy1=y1-.5
  rounded('silver',(sx0+sx1)/2,(sy0+sy1)/2,sx1-sx0,sy1-sy0,z0+.6,z1-.08,.55)
  rounded('steel',(sx0+sx1)/2,(sy0+sy1)/2,sx1-sx0-.5,sy1-sy0-.5,z1-.08,z1,.4)
  # Castellation fingers use actual pad centers, not invented electrical nets.
  pins(ref,z0,z0+.63,.7,clip=b,mat='gold')
  # Readable RF trace motif is a schematic display reconstruction, not a copied
  # antenna layout; stated in provenance and never offered for fabrication.
  antx=x0+24.0;az=z0+.61
  for yy in (y0+2.4,y0+5.0,y0+7.6,y0+10.2):box('gold',[antx,yy,az,x1-1.0,yy+.36,az+.035])
  for k,yy in enumerate((y0+2.4,y0+5.0,y0+7.6)):
   xx=x1-1.36 if k%2==0 else antx
   box('gold',[xx,yy,az,xx+.36,yy+2.96,az+.035])
  details[ref]=['32 x 15 x 0.6 mm module PCB','rounded 21.5 x 14 mm RF shield with folded rim','source-positioned gold castellations','10 mm exposed antenna zone; trace is illustrative, not RF design geometry']
 elif ref=='FPC1':
  # +X cable insertion; contact row along Y at the source 0.5 mm pitch.
  rounded('ivory',cx-.5,cy,w-1,h-.45,z0,z0+.5,.2)
  box('ivory',[x0+.35,y0+.35,z0+.4,x1-.25,y0+1.8,z1-.15]);box('ivory',[x0+.35,y1-1.8,z0+.4,x1-.25,y1-.35,z1-.15])
  box('ivory',[x0+.35,y0+1.7,z0+.45,x0+1.9,y1-1.7,z1-.3])
  box('cavity',[x0+1.9,cy-3.3,z0+.51,x1-.4,cy+3.3,z0+.61])
  box('mold',[x1-1.7,y0+.55,z1-.45,x1-.2,y1-.55,z1])
  for end in (-1,1):cylinder('steel',x1-1.6,cy+end*(h/2-.65),.25,z1-.5,z1-.05,20)
  for k in range(12):
   yy=cy+(k-5.5)*.5
   box('gold',[x0+1.1,yy-.12,z0+.63,x1-1.25,yy+.12,z0+.74])
  pins(ref,z0,z0+.18,.75,clip=b)
  # two clipped hold-down ears establish the reviewed external width
  for yy in (y0,y1-.45):box('silver',[x1-2.1,yy,z0,x1,yy+.45,z0+.22])
  details[ref]=['ivory socket with open cable channel facing +X','black hinged locking bar','12 gold contacts at source 0.5 mm pitch','two metal hold-down ears; recorded 10.72007 mm envelope retained']
 elif ref=='J1':
  # Rounded, hollow USB-C shield has an actual dark mouth and separate tongue.
  zc=z1-3.26/2;outside=poly_rect(cx,-zc,8.94,3.26,1.15,8);inside=poly_rect(cx,-zc,8.34,2.56,.88,8)
  tube('silver',outside,inside,y0,y1-.55,axis='y')
  box('cavity',[cx-3.55,y1-2.2,1.96,cx+3.55,y1-.7,z1-.35])
  rounded('mold',cx,(y0+y1-2)/2,6.6,y1-y0-2,zc-.35,zc+.35,.35)
  for pad in f['pads']:
   if not pad['number'].startswith(('A','B')):continue
   xx=pad['xy'][0]-72.11
   zlo,zhi=(zc+.35,zc+.41) if pad['number'].startswith('A') else (zc-.41,zc-.35)
   box('gold',[xx-.11,y0+.7,zlo,xx+.11,y0+3.8,zhi])
  pins(ref,1.6,1.82,.7,clip=b)
  for xx in (x0,x1-.3):
   for yy in (1.45,5.63):box('steel',[xx,yy-.45,z0,xx+.3,yy+.45,2.5])
  # rear retaining strip touches source reviewed depth; mouth remains open
  box('steel',[cx-3.4,y1-.55,1.7,cx+3.4,y1,2.1])
  details[ref]=['hollow rounded USB-C metal shell with open front mouth','separate insulated tongue and two rows of gold contacts','rear insulator and four source-aligned shell legs','contact shape is illustrative; source shell envelope and footprint placement retained']
 elif ref=='J3':
  rounded('ivory',cx,cy,w,h,z0,z0+.28,.18)
  ring('gold',cx,cy,1.15,.8,z0+.28,z1,48)
  ring('steel',cx,cy,1.23,1.03,z1-.25,z1,48)
  cylinder('ivory',cx,cy,.76,z0+.28,z1-.13,48)
  cylinder('gold',cx,cy,.21,z0+.3,z1-.03,32)
  pins(ref,z0,z0+.18,.75,clip=b)
  details[ref]=['coaxial annular U.FL outer contact','dielectric insert and center pin','source-oriented three-pad base']
 elif ref in ['L1','L2']:
  rounded('ferrite',cx,cy,w,h,z0+.12,z1-.1,.55 if ref=='L1' else .4)
  rounded('mold_edge',cx,cy,w-.4,h-.4,z1-.1,z1,.45)
  for side in (-1,1):
   xx0,xx1=(x0,x0+.8) if side<0 else (x1-.8,x1)
   box('silver',[xx0,y0+.3,z0,xx1,y1-.3,z0+.32])
  details[ref]=['rounded moulded power-inductor body','two wraparound metal terminations aligned to source pads']
 elif ref in ['X1','X2']:
  rounded('ceramic',cx,cy,w,h,z0,z0+.18,.2)
  rounded('silver',cx,cy,w-.1,h-.1,z0+.18,z1-.06,.3)
  rounded('steel',cx,cy,w-.35,h-.35,z1-.06,z1,.2)
  pins(ref,z0,z0+.14,.7,clip=b)
  details[ref]=['ceramic package base','rounded seam and metal crystal lid','source-oriented terminal pair']
 elif ref in ['D2','D3']:
  # Orientation follows the pair of source pads; body/lead allocation is a
  # generic package reconstruction, and D3 remains explicitly unverified.
  if h>w:
   rounded('mold',cx,cy,w,h*.65,z0+.12,z1-.008,.12)
   for yy0,yy1 in [(y0,y0+h*.21),(y1-h*.21,y1)]:box('silver',[x0+.1,yy0,z0,x1-.1,yy1,z0+.25])
   box('mark',[x0+.09,y1-h*.31,z1-.018,x1-.09,y1-h*.25,z1])
  else:raise AssertionError(ref)
  details[ref]=['two formed metal terminals and moulded diode body','polarity band is a generic display convention; D3 part identity and body remain unverified']
 elif ref=='Q1':
  rounded('mold',cx,cy,w,1.3,z0+.15,z1,.14)
  # SOT-23 source pads have two north and one south terminals.
  for pad in f['pads']:
   x=pad['xy'][0]-72.11;y=157.9-pad['xy'][1]
   yy0,yy1=(y0,cy-.45) if y<cy else (cy+.45,y1)
   box('silver',[x-.22,yy0,z0,x+.22,yy1,z0+.2])
   yy=cy-.6 if y<cy else cy+.5;box('silver',[x-.22,yy,z0+.17,x+.22,yy+.1,z0+.55])
  details[ref]=['SOT-23 moulded body','three individual bent terminals placed from actual source pads']
 else:
  # QFN/DFN packages: body dimensions use recorded envelope; all leads use
  # actual pad positions and are clipped to the package extent.
  rounded('mold',cx,cy,w,h,z0+.08,z1-.008,.12)
  pins(ref,z0,z0+.2,.76,clip=b)
  # Make the terminals visible in the side wall without extending the envelope.
  for pad in f['pads']:
   if not pad['number']:continue
   px=pad['xy'][0]-72.11;py=157.9-pad['xy'][1]
   if abs(px-cx)>.38*w:
    xx0,xx1=(x0,x0+.20) if px<cx else (x1-.20,x1)
    box('silver',[xx0,max(y0,py-.11),z0,xx1,min(y1,py+.11),z0+.28])
   elif abs(py-cy)>.38*h:
    yy0,yy1=(y0,y0+.2) if py<cy else (y1-.2,y1)
    box('silver',[max(x0,px-.11),yy0,z0,min(x1,px+.11),yy1,z0+.28])
  p1=next(p for p in f['pads'] if p['number']=='1');px=p1['xy'][0]-72.11;py=157.9-p1['xy'][1]
  bump_mark(cx+np.sign(px-cx)*(w/2-.42),cy+np.sign(py-cy)*(h/2-.42),min(.12,w/15),z1-.008)
  details[ref]=['rounded QFN/DFN moulded body','individual metal lands aligned with source pads','pin-1 corner indicator derived from source pad 1']

# Public official compatible MCU package, unscaled. Its canonical pin 1 is on
# the west edge; the source custom footprint starts on the south edge. +90 deg
# rotates the canonical model to place pin 1 on the actual source land.
UPSTREAM_PATH='Package_QFP.3dshapes/LQFP-100_14x14mm_P0.5mm.wrl'
UPSTREAM_URL='https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/9.0.2/'+UPSTREAM_PATH
model_path=A.work_root/'LQFP-100_14x14mm_P0.5mm.wrl'
if not model_path.exists():
 with urllib.request.urlopen(UPSTREAM_URL,timeout=60) as response:model_path.write_bytes(response.read())
vrml=model_path.read_text();assert vrml.startswith('#VRML V2.0') and 'Creative Commons CC-BY-SA 4.0' in vrml
# Pin source hash so a changed upstream response cannot silently alter the model.
UPSTREAM_SHA='bcabc57a9c8710423a9e135eac98b4ea306d7fa097e089383c2a26c0f42a38dd'
assert sha(model_path.read_bytes())==UPSTREAM_SHA, 'Official compatible package hash changed'
current='U10';f=FP[current];ox=f['xy'][0]-72.11;oy=157.9-f['xy'][1]
for idxs,pts,mat in re.findall(r'coordIndex\s*\[([^\]]+)\]\s*coord Coordinate\s*\{\s*point\s*\[([^\]]+)\].*?material USE ([\w-]+)',vrml,re.S):
 p=np.fromstring(pts.replace(',',' '),sep=' ').reshape(-1,3)*2.54
 p=np.column_stack([-p[:,1]+ox,p[:,0]+oy,p[:,2]+1.6])
 faces=[[int(i) for i in chunk.replace(',',' ').split()] for chunk in idxs.split('-1') if chunk.replace(',',' ').strip()]
 emit('silver' if mat.startswith('PIN') else 'mark' if 'LABEL' in mat else 'mold',p,faces)
details['U10']=['official KiCad 9.0.2 LQFP-100 14 x 14 mm, 0.5 mm-pitch package','100 individually formed gull-wing leads, bevelled body and pin-1 mark','unscaled package rotated +90 degrees to match custom source pad numbering','compatible package replacement, not the excluded custom vendor model']
for ref in sorted(targets-{'U10'}):reconstruct(ref)

# Keep all original meshes other than prior proxy/reconstruction parts.
parts=[];data={};ranges={}
for p in manifest['parts']:
 seg=prov['componentTriangleRangesByMesh'].get(p['id'],[])
 if any(s['ref'] in targets for s in seg):continue
 q=copy.deepcopy(p);parts.append(q)
 def read(k,dtype):
  s=p[k];return np.frombuffer(oldblob,dtype=dtype,count=s['count']*s['itemSize'],offset=s['byteOffset']).reshape(-1,s['itemSize']).copy()
 data[p['id']]=(read('position','<f4'),read('normal','<f4'),read('index','<u4').reshape(-1,3))
 if seg:ranges[p['id']]=copy.deepcopy(seg)

vertices=defaultdict(list);triangle_counts=defaultdict(int);material_sets=defaultdict(set)
for key,pieces in sorted(batches.items()):
 pp=[];nn=[];ii=[];at=0;tri=0;segs=[];refs=[]
 for ref,p,n,i in pieces:
  pp.append(p);nn.append(n);ii.append(i+at);at+=len(p)
  if segs and segs[-1]['ref']==ref:segs[-1]['triangleCount']+=len(i)
  else:segs.append({'ref':ref,'firstTriangle':tri,'triangleCount':len(i)})
  tri+=len(i);vertices[ref].append(p);triangle_counts[ref]+=len(i);material_sets[ref].add(key)
  if ref not in refs:refs.append(ref)
 p=np.concatenate(pp);n=np.concatenate(nn);i=np.concatenate(ii)
 packed=np.ascontiguousarray(np.c_[p,n],dtype='<f4');unique,inv=np.unique(packed,axis=0,return_inverse=True)
 p=unique[:,:3];n=unique[:,3:];i=inv[i].astype('<u4');data[key]=(p,n,i);ranges[key]=segs
 color,roughness,metalness=MATERIALS[key.removeprefix('pcb_package_')]
 lo=p.min(0);hi=p.max(0)
 parts.append({'id':key,'color':color,'opacity':1,'roughness':roughness,'metalness':metalness,'doubleSided':True,'group':'pcb','name':'Finished package details','description':'Licensed compatible MCU package and independently reconstructed component packages; see per-reference provenance','fidelity':'mixed-package-detail','componentRefs':refs,'materialSource':'Editorial display finishes; not vendor color or surface specifications','explode':[0,0,0],'bounds':[lo.tolist(),hi.tolist()],'size':(hi-lo).tolist(),'vertices':len(p),'triangles':len(i)})

for ref in sorted(targets):
 rec=records[ref];p=np.concatenate(vertices[ref]).astype('<f4');bounds=np.r_[p.min(0),p.max(0)].tolist();expected=ENV[ref]['bounds']
 for key in ['missingGeometry','originalReferenceKind']:rec.pop(key,None)
 rec.update(fidelity='official-compatible-package-model' if ref=='U10' else 'unverified-reconstructed-allowance' if ref=='D3' else 'source-dimensioned-reconstruction',bounds=bounds,reviewedBounds=expected,maximumReviewedBoundDeviationMm=float(np.max(np.abs(np.array(bounds)-expected))),triangleCount=triangle_counts[ref],materialMeshCount=len(material_sets[ref]),geometryDetails=details[ref],sourceDocuments=[{'url':SOURCE_URL+'Mechanical/reference/component_envelopes.json','purpose':'recorded component placement and bounding extent'},{'url':SOURCE_URL+'Mechanical/reference/board_datums.json','purpose':'footprint orientation and individual pad centers'}],reconstructionLicense='CERN-OHL-P-2.0',shapeLimitations='Display reconstruction. Package internals, curves and finishes are simplified; no fit, electrical or manufacturing validation.')
 if ref in DRAWINGS:rec['sourceDocuments'].append(DRAWINGS[ref])
 if ref=='U10':
  rec['librarySource']={'path':UPSTREAM_PATH,'url':UPSTREAM_URL,'release':'9.0.2','sha256':sha(model_path.read_bytes()),'bytes':model_path.stat().st_size,'available':True,'license':'CC-BY-SA-4.0 with KiCad design/generated-file exception'}
  rec['compatiblePackageTransform']={'rotationDegrees':[0,0,90],'scale':[1,1,1],'translationMm':[ox,oy,1.6],'reason':'Align canonical pin 1 with custom footprint south-edge pad 1'}
  rec['shapeLimitations']='Official generic package matching 14 x 14 mm LQFP-100 / 0.5 mm pitch. It is not the excluded custom source model; no silicon-vendor fit certification.'
  rec.pop('reconstructionLicense',None)
 if ref=='SW2':rec['shapeLimitations']='BOM names PEC11L-4120F-S0020; assigned footprint/model names PEC11R. Bourns PEC11L has different mounting-tab spacing and a 20 mm shaft from the body front. The recorded source footprint/extent (top Z21.10009) is retained, with D-shaped shaft topology; actual shaft length and mounting compatibility remain unverified. Do not use for fit.'
 if ref=='D3':rec['shapeLimitations']='Original official path is unavailable, and source marked the package UNVERIFIED. Generic two-terminal topology within that allowance does not identify the real diode.'

blob=bytearray()
def pack(a,dtype,item):
 a=np.ascontiguousarray(a,dtype=dtype)
 while len(blob)%4:blob.append(0)
 start=len(blob);blob.extend(a.tobytes())
 return {'byteOffset':start,'byteLength':a.nbytes,'count':a.size//item,'itemSize':item,'componentType':'FLOAT' if dtype=='<f4' else 'UNSIGNED_INT'}
for part in parts:
 p,n,i=data[part['id']]
 part.update(position=pack(p,'<f4',3),normal=pack(n,'<f4',3),index=pack(i,'<u4',1))
(OUT/'pcb.bin').write_bytes(blob);compressed=gzip.compress(blob,compresslevel=9,mtime=0);(OUT/'pcb.bin.gz').write_bytes(compressed)
counts={**manifest['counts'],'vendorEnvelopeProxies':0,'officialCompatiblePackageMeshes':1,'reconstructedPackageMeshes':20,'unverifiedAllowances':1}
lo=np.min([p['bounds'][0] for p in parts],axis=0);hi=np.max([p['bounds'][1] for p in parts],axis=0)
manifest.update(revision='Public board d0c4d9ea34297d8671f464dedc6018189c33ea76; finished-package revision 2',geometry='Native KiCad board surfaces and 111 original official component instances, plus one official compatible LQFP package, 20 independently reconstructed packages and one explicitly unverified diode reconstruction. No rectangular component envelope proxies or excluded vendor CAD.',binaryBytes=len(blob),binarySha256=sha(blob),binaryGzipBytes=len(compressed),binaryGzipSha256=sha(compressed),bounds=[lo.tolist(),hi.tolist()],center=((lo+hi)/2).tolist(),size=(hi-lo).tolist(),partCount=len(parts),triangles=sum(p['triangles'] for p in parts),parts=parts,counts=counts)
prov.update(counts=counts,components=sorted(records.values(),key=lambda x:x['ref']),componentTriangleRangesByMesh=ranges)
prov['fidelityNotes']=[
 '111 original official KiCad 9.0.2 component instances and the original native board mesh attributes are unchanged.',
 'U10 uses an unscaled, licensed official KiCad LQFP-100 compatible package, explicitly rotated to match the source custom pad numbering. It is not the excluded vendor mesh.',
 '20 formerly boxed local/vendor references now have independent package-shape reconstructions, with source-recorded placement/bounds and individual footprint pad locations. Manufacturer drawings inform the BM83, FPC and encoder forms. No excluded CAD was downloaded or copied.',
 'D3 has a generic two-terminal shape but retains its source UNVERIFIED status; the referenced library model is missing.',
 'SW2 BOM/footprint mismatch remains explicit: actual PEC11L shaft length/tab spacing must be checked. The source-recorded PEC11R model envelope is retained for this visualization.',
 'Reconstructed connector internals, actuator details, RF antenna trace motif, metal finishes and curves are simplified illustrations, not mechanical or electrical validation.',
 '142 footprint placements and 133 source model transforms remain attributable to the original board; nine mounting-hole/test-pad footprints have no assigned component model.',
 'Native board coating surfaces, holes and laminate are retained; original micrometre coating-sidewall omission and +0.005 mm component-datum calibration are unchanged.'
]
prov['unsupportedFeatures']=['Exact excluded vendor CAD, verified connector internals and RF antenna artwork','Verified PEC11L-versus-PEC11R shaft length, mounting-tab spacing or enclosure fit','D3 part identification','Internal copper layers/electrical connectivity','Physical assembly, RF, electrical, manufacturing or performance certification']
prov['licenses']['reconstructedPackages']='Independent source-dimensioned display geometry: CERN-OHL-P-2.0; generator script MIT.'
prov['validation'].update(noComponentEnvelopeBoxes=True,reconstructedReferenceCount=22,reconstructedReferencesHaveMultipleMaterials=all(len(material_sets[r])>=2 for r in targets),minimumAddedComponentTriangles=min(triangle_counts.values()),maximumAddedReviewedBoundDeviationMm=max(records[r]['maximumReviewedBoundDeviationMm'] for r in targets))
prov['generation']={'finishScript':'scripts/kiku-pcb/finish_component_packages.py','nativeGeometryPreserved':True,'upstreamCompatibleModelSha256':sha(model_path.read_bytes()),'reconstructionReferenceCount':22}
(OUT/'pcb.json').write_text(json.dumps(manifest,indent=2)+'\n');(OUT/'pcb-provenance.json').write_text(json.dumps(prov,indent=2)+'\n')
(OUT/'KICAD-COMPATIBLE-MODEL-NOTICE.txt').write_text('Source: '+UPSTREAM_URL+'\nSHA-256: '+sha(model_path.read_bytes())+'\n\n'+vrml.split('Shape {',1)[0])
np.savez_compressed(A.work_root/'review-meshes.npz',**{key+'_'+name:arr for key,mesh in data.items() for name,arr in zip(['position','normal','index'],mesh)})
(OUT/'PACKAGE-RECONSTRUCTIONS.md').write_text('''# Finished component package geometry\n\nThe original board and 111 official KiCad model instances are preserved. U10 now\nuses KiCad 9.0.2's LQFP-100 14 × 14 mm / 0.5 mm-pitch compatible package under\nCC-BY-SA-4.0 with the KiCad design/generated-file exception. It is rotated to\nmatch the custom source pad numbering, never rescaled. The exact fetched URL and\nSHA-256 are recorded per component in `pcb-provenance.json`.\n\nThe remaining 21 former envelope boxes are independent display reconstructions:\n20 source-dimensioned packages plus the explicitly unverified D3 allowance.\nThey use the public project's placement records, bounds and source pad centers.\nThe BM83, FPC and encoder also cite public manufacturer drawings in provenance.\nTheir authored geometry is released under CERN-OHL-P-2.0; the generator is MIT.\nNo excluded vendor CAD was recovered, downloaded or redistributed.\n\nVisible additions include hollow USB-C and U.FL sockets, FPC cable opening and\ncontacts, BM83 PCB/shield/castellations/antenna zone, encoder D shaft and bushing,\ntact-switch actuators, QFN lands, power-inductor terminations and crystal lids.\nThe antenna trace motif is illustrative, not an RF layout.\n\n## Important source discrepancy\n\nSW2's BOM says PEC11L-4120F-S0020, but the assigned footprint and old model say\nPEC11R. The manufacturer PEC11L drawing has different mounting-tab spacing and\na 20 mm shaft measured above the body. The historical source envelope ends at\nZ21.10009 mm; it is retained here. Neither shaft fit nor enclosure compatibility\nis verified. D3 remains an unidentified/unverified two-terminal allowance.\n\n## Rebuild\n\nAfter the native build, run:\n\n    python scripts/kiku-pcb/finish_component_packages.py --source-root /path/to/kiku --work-root /tmp/kiku-build\n    python scripts/kiku-pcb/verify_assets.py assets/models/kiku-pcb /path/to/kiku\n\nThe finisher is deterministic and can run against either the original generated\nassets or its own finished output. It downloads only the pinned official KiCad\ncompatible package; it never reads excluded vendor model files.\n\nThese are reviewable browser illustrations, not manufacturing or fit models.\n''')
print(json.dumps({'counts':counts,'triangles':manifest['triangles'],'materialMeshes':len(parts),'binaryBytes':len(blob),'gzipBytes':len(compressed),'addedReferenceTriangles':dict(sorted(triangle_counts.items())),'addedBoundsErrors':{r:records[r]['maximumReviewedBoundDeviationMm'] for r in sorted(targets)}},indent=2))
