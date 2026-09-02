(() => {
  // Authoritative KiCad Edge.Cuts: X 54.1..96.4 mm, Y 32.0..133.5 mm.
  // Local board frame is centred at (75.25, 82.75) mm.
  const W = 42.3, H = 101.5, DESIGN_H = 95;
  const CENTER_X = 75.25, CENTER_Y = 82.75;
  const zFromTop = (y) => H / 2 - (y / DESIGN_H) * H;
  const fromKiCad = (x, y) => ({ x: x - CENTER_X, z: CENTER_Y - y });
  const drawTop = (ctx, w, h) => {
    const sx = w / W, sy = h / H;
    const X = (mm) => (mm + W/2) * sx;
    const Y = (mm) => (mm / DESIGN_H) * h;
    const line = (x1,y1,x2,y2,width,color) => { ctx.strokeStyle=color; ctx.lineWidth=width*sx; ctx.beginPath(); ctx.moveTo(X(x1),Y(y1)); ctx.lineTo(X(x2),Y(y2)); ctx.stroke(); };
    const text = (s,x,y,size=1.35,weight=600) => { ctx.fillStyle='#f1eee6'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${weight} ${Math.round(size*sy)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`; ctx.fillText(s,X(x),Y(y)); };
    ctx.fillStyle='#080a0b'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#161a1c';
    for(let yy=2.4; yy<H-2; yy+=2.45){ for(let xx=-18.2; xx<=18.2; xx+=2.45){ ctx.beginPath(); ctx.arc(X(xx),Y(yy),0.18*sx,0,Math.PI*2); ctx.fill(); } }
    text('u.FL',0,2.2,1.7,700);
    line(-16.2,4.7,16.2,4.7,0.15,'#8f9492'); line(-16.2,5.8,16.2,5.8,0.15,'#8f9492'); text('Solder Mask',0,7.0,1.15,500);
    line(-16.2,14.8,16.2,14.8,0.92,'#d3d0c8'); text('Without Solder Mask',0,17.2,1.15,500);
    line(-15.3,26.4,15.3,26.4,0.13,'#6f7775'); text('Tuning Capacitors',0,28.5,1.12,500);
    line(-15.3,37.6,15.3,37.6,0.13,'#59605e'); text('Split–Pi Filter',0,40.0,1.13,500);
    line(-15.3,48.7,-2.0,48.7,0.86,'#c7bda8'); line(2.0,48.7,15.3,48.7,0.86,'#c7bda8'); text('Split–Pi Filter without Solder Mask',0,52.0,1.02,500);
    line(-15.3,60.6,15.3,60.6,0.13,'#565c5a'); text('Split–Pi Filter',0,63.2,1.13,500);
    text('SMA',0,68.5,1.8,700); text('Solder Mask',0,77.0,1.08,500); text('Split–Pi Filter',0,92.0,1.13,500);
    const smaOutline=(cx,cy)=>{ctx.strokeStyle='#eef0e8';ctx.lineWidth=0.16*sx;ctx.strokeRect(X(cx-3.0),Y(cy-3.0),6.0*sx,6.0*sy);};
    smaOutline(-15.0,73.0); smaOutline(15.0,73.0); smaOutline(-15.0,86.4); smaOutline(15.0,86.4);
    line(-12.0,73.0,12.0,73.0,0.10,'#454a49'); line(-12.0,86.4,12.0,86.4,0.10,'#454a49');
    const pad=(x,y,ww=0.7,hh=0.7,c='#b4aba0')=>{ctx.fillStyle=c;ctx.fillRect(X(x-ww/2),Y(y-hh/2),ww*sx,hh*sy);};
    [[-6,26.4],[5.7,26.4],[-6,37.6],[-4.9,37.6],[0,37.6],[1.0,37.6],[5.6,37.6],[-6,60.6],[-0.8,60.6],[0.4,60.6],[5.8,60.6],[-6,86.4],[-0.8,86.4],[0.5,86.4],[5.8,86.4]].forEach(([x,y])=>pad(x,y,0.55,0.75));
  };

  const drawBottom = (ctx,w,h) => {
    const sx=w/W, sy=h/H; const X=(mm)=>(mm+W/2)*sx, Y=(mm)=>(mm/DESIGN_H)*h;
    const text=(s,x,y,size=1.0,weight=500)=>{ctx.fillStyle='#f1eee6';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${weight} ${Math.round(size*sy)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;ctx.fillText(s,X(x),Y(y));};
    ctx.fillStyle='#080a0b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#161a1c';for(let yy=2.4;yy<H-2;yy+=2.45){for(let xx=-18.2;xx<=18.2;xx+=2.45){ctx.beginPath();ctx.arc(X(xx),Y(yy),0.18*sx,0,Math.PI*2);ctx.fill();}}
    text('– Board Details –',0,14.0,1.15,650); text('Layers: 2',0,15.8); text('PCB Thickness: 1.6mm',0,17.5); text('Material Type: FR4 TG135',0,19.2); text('Outer Copper Weight: 1oz',0,20.9); text('Impedance Trace to Copper: 0.2mm',0,22.6); text('Target Impedance: 50Ω',0,24.3);
    text('– Coplanar Single Ended (With Solder Mask) –',0,28.2,0.90,650); text('Trace Width: 0.8877mm',0,30.0); text('Tracelength (u.FL): 31.1mm',0,31.7); text('Tracelength Split Pi Filter (u.FL): 15.2750mm (×2)',0,33.4,0.86); text('Tracelength (SMA): 29.2mm',0,35.1); text('Tracelength Split Pi Filter (SMA): 13.8425mm',0,36.8,0.86);
    text('– Coplanar Single Ended (Without Solder Mask) –',0,41.0,0.86,650); text('Trace Width: 1.0244mm',0,42.8); text('Tracelength (SMA): 31.1mm',0,44.5); text('Tracelength Split Pi Filter (SMA): 14.2mm (×2)',0,46.2,0.86);
    text('REV A',0,72.5,1.35,700); text('u.FL & SMA Test Board',0,75.0,1.23,650); text('Designed by Andrew Chung',0,77.4,1.16,600);
  };

  const components = [];
  const addKiCad = (spec, x, y, rot) => {
    const p = fromKiCad(x, y);
    components.push({...spec, x:p.x, z:p.z, rot, explodeX:Math.abs(p.x)>10?(p.x<0?-1.4:1.4):0});
  };

  // Exact populated footprint centres and rotations from the authoritative KiCad PCB.
  [
    ['J1',58.6000,36.6000,180],['J2',91.8000,36.6000,0],
    ['J3',58.6000,48.6000,180],['J4',91.8000,48.6000,0],
    ['J5',58.6000,60.6000,180],['J6',91.8000,60.6000,0],
    ['J7',58.5575,72.6000,180],['J8',91.7825,72.6000,0],
    ['J9',58.6057,84.6000,180],['J10',91.8057,84.6000,0],
    ['J11',58.6050,96.6250,180],['J12',91.8250,96.6250,0]
  ].forEach(([ref,x,y,rot],i)=>addKiCad({
    type:'ufl',ref,name:'Hirose u.FL connector',
    copy:'U.FL-R-SMT-1 vertical coaxial connector at its exact KiCad footprint centre and rotation.',
    modelOffsetX:0.475,baseOffsetX:-0.125,w:2.85,h:0.55,d:3.0,explode:4.8+(i%4)*0.3
  },x,y,rot));

  [
    ['C1',81.3500,61.1300,-90],['C2',69.3000,61.1300,-90],
    ['C3',69.5325,73.1300,-90],['C4',81.0825,73.1300,-90],
    ['C5',69.4600,85.2000,-90],['C6',81.1557,85.1900,-90],
    ['C7',69.5050,97.1550,-90],['C8',81.0600,97.1500,-90],
    ['C9',81.1900,125.1250,-90],['C10',69.4900,125.1300,-90]
  ].forEach(([ref,x,y,rot],i)=>addKiCad({
    type:'capacitor',ref,name:'0402 capacitor',
    copy:'1.0 × 0.5 mm 0402 capacitor at its exact KiCad footprint centre and rotation.',
    w:1.0,h:0.50,d:0.50,explode:5.0+(i%5)*0.28
  },x,y,rot));

  [
    ['L1',75.0500,72.6000,0],['L2',75.2732,84.6000,0],
    ['L3',75.2725,96.6250,0],['L4',75.3425,124.6000,180]
  ].forEach(([ref,x,y,rot],i)=>addKiCad({
    type:'inductor',ref,name:'0201 inductor',
    copy:'0.6 × 0.3 mm 0201 inductor at its exact KiCad footprint centre and rotation.',
    w:0.60,h:0.30,d:0.30,explode:5.5+i*0.32
  },x,y,rot));

  // The source references an EasyEDA WRL that is not shipped with this web
  // project, so its connector body is reconstructed at the exact KiCad centre.
  const SMA = [
    ['U1', 90.00, 110.60, 'Masked SMA reference'],
    ['U2', 60.80, 110.60, 'Masked SMA reference'],
    ['U3', 89.95, 124.60, 'Split-pi SMA path'],
    ['U4', 60.65, 124.60, 'Split-pi SMA path']
  ];
  SMA.forEach(([ref,x,y,label],i)=>{
    const p=fromKiCad(x,y);
    components.push({type:'sma',ref,name:'SMA connector',copy:label+' · exact KiCad centre and 0° rotation; web body reconstructed to the source footprint envelope.',x:p.x,z:p.z,rot:0,flange:6.5,explode:8.2+i*0.35,explodeX:p.x<0?-2.4:2.4});
  });

  const holes=[];
  const addSmaHoles=(cx,cz)=>{[[0,0,1.500022,2.0],[-2.55,-2.55,1.599996,2.2],[2.55,-2.55,1.599996,2.2],[-2.55,2.55,1.599996,2.2],[2.55,2.55,1.599996,2.2]].forEach(([dx,dy,d,padD])=>holes.push({x:cx+dx,z:cz-dy,d,padD}));};
  SMA.forEach(([,x,y])=>{const p=fromKiCad(x,y);addSmaHoles(p.x,p.z);});

  window.PCB_OBJECT_CONFIG = {
    boardName:'RF Test Board',
    boardCopy:'Rev A 2-layer RF coupon: 42.3 × 101.5 × 1.6 mm board envelope with all 30 populated footprints placed and rotated directly from the authoritative KiCad source.',
    width:W,height:H,thickness:1.6,radius:5.0,maskColor:0x07090a,bottomColor:0x07090a,edgeColor:0x17191a,
    drawTop,drawBottom,
    topImage:'assets/pcb-textures/rf-test-board-top.png',
    bottomImage:'assets/pcb-textures/rf-test-board-bottom.png',
    textureWidth:1700,textureHeight:4080,components,holes,fadeSurfaceOnExplode:false,cameraDistance:142,startYaw:-26,startPitch:42
  };
})();
