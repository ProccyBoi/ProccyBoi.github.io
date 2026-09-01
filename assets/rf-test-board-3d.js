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

  const components = [
    {type:'ufl',ref:'J1',name:'u.FL connector',copy:'Masked 50 Ω u.FL reference path.',x:-16.25,z:zFromTop(4.7),rot:0,explode:4.8,explodeX:-2},
    {type:'ufl',ref:'J2',name:'u.FL connector',copy:'Masked 50 Ω u.FL reference path.',x:16.25,z:zFromTop(4.7),rot:0,explode:4.8,explodeX:2},
    {type:'ufl',ref:'J3',name:'u.FL connector',copy:'Exposed-copper u.FL reference path.',x:-16.25,z:zFromTop(14.8),rot:0,explode:5.4,explodeX:-2},
    {type:'ufl',ref:'J4',name:'u.FL connector',copy:'Exposed-copper u.FL reference path.',x:16.25,z:zFromTop(14.8),rot:0,explode:5.4,explodeX:2}
  ];

  // Explicit populated RF placements.  Package envelopes are realistic 0402/0603
  // scale instead of the oversized placeholder blocks used in the first viewer.
  const rfParts = [
    ['capacitor','C1',-16.20,26.40,90,1.60,0.78,0.82,'Series tuning capacitor'],
    ['capacitor','C2', 16.20,26.40,90,1.60,0.78,0.82,'Series tuning capacitor'],
    ['capacitor','C11',-6.00,26.40,0,1.00,0.50,0.52,'Tuning capacitor'],
    ['capacitor','C12', 5.70,26.40,0,1.00,0.50,0.52,'Tuning capacitor'],

    ['capacitor','C3',-16.20,37.60,90,1.60,0.78,0.82,'Series split-pi capacitor'],
    ['capacitor','C4', 16.20,37.60,90,1.60,0.78,0.82,'Series split-pi capacitor'],
    ['capacitor','C13',-5.60,37.60,0,1.00,0.50,0.52,'Split-pi shunt capacitor'],
    ['inductor','L1',0.00,37.60,0,1.60,0.80,0.82,'Split-pi series inductor'],
    ['capacitor','C14',5.60,37.60,0,1.00,0.50,0.52,'Split-pi shunt capacitor'],

    ['capacitor','C5',-16.20,48.70,90,1.60,0.78,0.82,'Series exposed-copper capacitor'],
    ['capacitor','C6', 16.20,48.70,90,1.60,0.78,0.82,'Series exposed-copper capacitor'],
    ['capacitor','C15',-0.80,48.70,0,1.00,0.50,0.52,'Exposed-copper tuning capacitor'],
    ['capacitor','C16', 0.80,48.70,0,1.00,0.50,0.52,'Exposed-copper tuning capacitor'],

    ['capacitor','C7',-16.20,60.60,90,1.60,0.78,0.82,'Series split-pi capacitor'],
    ['capacitor','C8', 16.20,60.60,90,1.60,0.78,0.82,'Series split-pi capacitor'],
    ['capacitor','C17',-0.80,60.60,0,1.00,0.50,0.52,'Split-pi shunt capacitor'],
    ['inductor','L2',0.40,60.60,0,1.60,0.80,0.82,'Split-pi series inductor'],
    ['capacitor','C18',5.80,60.60,0,1.00,0.50,0.52,'Split-pi shunt capacitor'],

    ['capacitor','C9',-6.00,86.40,0,1.00,0.50,0.52,'SMA-path tuning capacitor'],
    ['capacitor','C10',-0.80,86.40,0,1.00,0.50,0.52,'SMA-path shunt capacitor'],
    ['inductor','L3',0.50,86.40,0,1.60,0.80,0.82,'SMA-path series inductor'],
    ['resistor','R1',5.80,86.40,0,1.00,0.46,0.52,'SMA-path damping/tuning element']
  ];
  rfParts.forEach(([type,ref,x,y,rot,w,h,d,name],i)=>components.push({
    type,ref,name,copy:'Populated RF matching element at the board-source placement.',
    x,z:zFromTop(y),rot,w,h,d,explode:5.3+(i%7)*0.34,
    explodeX:Math.abs(x)>10?(x<0?-1.4:1.4):0
  }));

  // Four SMA footprints were missing usable library bodies, so their connector
  // geometry is reconstructed at the exact KiCad centres and 0° rotations.
  const SMA = [
    ['U1', 90.00, 110.60, 'Masked SMA reference'],
    ['U2', 60.80, 110.60, 'Masked SMA reference'],
    ['U3', 89.95, 124.60, 'Split-pi SMA path'],
    ['U4', 60.65, 124.60, 'Split-pi SMA path']
  ];
  SMA.forEach(([ref,x,y,label],i)=>{
    const p=fromKiCad(x,y);
    components.push({type:'sma',ref,name:'SMA connector',copy:label+' · KiCad centre, 0° rotation.',x:p.x,z:p.z,rot:0,explode:8.2+i*0.35,explodeX:p.x<0?-2.4:2.4});
  });

  const holes=[];
  const addSmaHoles=(cx,cz)=>{[[0,0],[-2.15,-2.15],[2.15,-2.15],[-2.15,2.15],[2.15,2.15]].forEach(([dx,dy],i)=>holes.push({x:cx+dx,z:cz-dy,d:i?1.10:1.25,ring:0.12}));};
  SMA.forEach(([,x,y])=>{const p=fromKiCad(x,y);addSmaHoles(p.x,p.z);});

  window.PCB_OBJECT_CONFIG = {
    boardName:'RF Test Board',
    boardCopy:'Rev A source-derived 2-layer RF coupon: exact 42.3 × 101.5 × 1.6 mm envelope, 30 populated top-side footprints with 0402/0603-scale matching parts, and four reconstructed SMA bodies at their KiCad placements.',
    width:W,height:H,thickness:1.6,radius:5.0,maskColor:0x07090a,bottomColor:0x07090a,edgeColor:0x17191a,
    drawTop,drawBottom,textureWidth:1700,textureHeight:4080,components,holes,fadeSurfaceOnExplode:false,cameraDistance:142,startYaw:-26,startPitch:42
  };
})();
