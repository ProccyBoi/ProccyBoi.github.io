(() => {
  const W = 40, H = 95;
  const zFromTop = (y) => H / 2 - y;
  const drawTop = (ctx, w, h) => {
    const sx = w / W, sy = h / H;
    const X = (mm) => (mm + W/2) * sx;
    const Y = (mm) => mm * sy;
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
    const sx=w/W, sy=h/H; const X=(mm)=>(mm+W/2)*sx, Y=(mm)=>mm*sy;
    const text=(s,x,y,size=1.0,weight=500)=>{ctx.fillStyle='#f1eee6';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${weight} ${Math.round(size*sy)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;ctx.fillText(s,X(x),Y(y));};
    ctx.fillStyle='#080a0b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#161a1c';for(let yy=2.4;yy<H-2;yy+=2.45){for(let xx=-18.2;xx<=18.2;xx+=2.45){ctx.beginPath();ctx.arc(X(xx),Y(yy),0.18*sx,0,Math.PI*2);ctx.fill();}}
    text('– Board Details –',0,14.0,1.15,650); text('Layers: 2',0,15.8); text('PCB Thickness: 1.6mm',0,17.5); text('Material Type: FR4 TG135',0,19.2); text('Outer Copper Weight: 1oz',0,20.9); text('Impedance Trace to Copper: 0.2mm',0,22.6); text('Target Impedance: 50Ω',0,24.3);
    text('– Coplanar Single Ended (With Solder Mask) –',0,28.2,0.90,650); text('Trace Width: 0.8877mm',0,30.0); text('Tracelength (u.FL): 31.1mm',0,31.7); text('Tracelength Split Pi Filter (u.FL): 15.2750mm (×2)',0,33.4,0.86); text('Tracelength (SMA): 29.2mm',0,35.1); text('Tracelength Split Pi Filter (SMA): 13.8425mm',0,36.8,0.86);
    text('– Coplanar Single Ended (Without Solder Mask) –',0,41.0,0.86,650); text('Trace Width: 1.0244mm',0,42.8); text('Tracelength (SMA): 31.1mm',0,44.5); text('Tracelength Split Pi Filter (SMA): 14.2mm (×2)',0,46.2,0.86);
    text('REV A',0,72.5,1.35,700); text('u.FL & SMA Test Board',0,75.0,1.23,650); text('Designed by Andrew Chung',0,77.4,1.16,600);
  };

  const components = [
    {type:'ufl',ref:'J1',name:'u.FL connector',copy:'Top 50 Ω coplanar-with-ground reference path.',x:-16.25,z:zFromTop(4.7),rot:0,explode:4.8,explodeX:-2},
    {type:'ufl',ref:'J2',name:'u.FL connector',copy:'Top 50 Ω coplanar-with-ground reference path.',x:16.25,z:zFromTop(4.7),rot:0,explode:4.8,explodeX:2},
    {type:'ufl',ref:'J3',name:'u.FL connector',copy:'Reference path with the solder mask removed over the RF trace.',x:-16.25,z:zFromTop(14.8),rot:0,explode:5.4,explodeX:-2},
    {type:'ufl',ref:'J4',name:'u.FL connector',copy:'Reference path with the solder mask removed over the RF trace.',x:16.25,z:zFromTop(14.8),rot:0,explode:5.4,explodeX:2},
  ];
  const rows=[
    {y:26.4,label:'Tuning network',centres:[-6,5.7]},
    {y:37.6,label:'Split-pi filter',centres:[-5.6,0,5.6]},
    {y:48.7,label:'Split-pi filter / exposed copper',centres:[-0.8,0.8]},
    {y:60.6,label:'Split-pi filter',centres:[-0.8,0.4,5.8]}
  ];
  rows.forEach((row,ri)=>{
    for(const x of [-16.2,16.2]) components.push({type:'passive',ref:`C${ri*2+(x<0?1:2)}`,name:'RF series capacitor',copy:row.label,x,z:zFromTop(row.y),w:2.5,h:1.45,d:1.8,material:'greenCeramic',rot:90,explode:4.5+ri*0.7,explodeX:x<0?-1.5:1.5});
    row.centres.forEach((x,ci)=>components.push({type:'passive',ref:`F${ri+1}.${ci+1}`,name:row.label,copy:'Small tuning/filter footprint on the measured RF path.',x,z:zFromTop(row.y),w:0.95,h:0.48,d:0.60,material:'ceramic',rot:0,explode:5.2+ri*0.7}));
  });

  const holes=[]; const addSmaHoles=(cx,cy)=>{[[0,0],[-2.15,-2.15],[2.15,-2.15],[-2.15,2.15],[2.15,2.15]].forEach(([dx,dy],i)=>holes.push({x:cx+dx,z:zFromTop(cy+dy),d:i?1.10:1.25,ring:0.12}));};
  addSmaHoles(-15,73); addSmaHoles(15,73); addSmaHoles(-15,86.4); addSmaHoles(15,86.4);

  window.PCB_OBJECT_CONFIG = {
    boardName:'RF Test Board', boardCopy:'Rev A 2-layer RF coupon for directly comparing u.FL/SMA transitions, solder-mask effects and split-pi/tuning structures.',
    width:W,height:H,thickness:1.6,radius:2.5,maskColor:0x07090a,bottomColor:0x07090a,edgeColor:0x1b1d1d,
    drawTop,drawBottom,textureWidth:1600,textureHeight:3800,components,holes,fadeSurfaceOnExplode:false,cameraDistance:132,startYaw:-26,startPitch:42
  };
})();
